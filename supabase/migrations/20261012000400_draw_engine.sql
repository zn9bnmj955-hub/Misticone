-- OrgaSport — phase 2: draw engine persistence, scoring table, PIN access.

alter type public.match_status add value if not exists 'pending' before 'waiting_venue';

-- Optimistic lock: every applied action increments the version.
alter table public.tournaments add column state_version int not null default 0;

alter table public.rounds
  add constraint rounds_phase_check check (phase in ('elimination', 'pool', 'final', 'swiss', 'league', 'melee'));

alter table public.matches
  add column pool text,
  -- Sides with several teams (mêlée tournante). One team = team_a_id/team_b_id.
  add column side_a uuid[],
  add column side_b uuid[],
  add column queued_at timestamptz,
  add column tiebreak_a int check (tiebreak_a is null or tiebreak_a >= 0),
  add column tiebreak_b int check (tiebreak_b is null or tiebreak_b >= 0),
  add column winner_side text check (winner_side in ('A', 'B', 'draw'));
create index on public.matches (round_id);
create index on public.matches using gin (side_a);
create index on public.matches using gin (side_b);

-- Code given to captains to enter their score (never public).
create table public.team_secrets (
  team_id uuid primary key references public.teams (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4,8}$')
);
alter table public.team_secrets enable row level security;
create policy "managers read team codes" on public.team_secrets
  for select using (public.can_manage_tournament((select t.tournament_id from public.teams t where t.id = team_id)));

alter table public.tournament_actions
  add column changes jsonb,
  add column actor_label text,
  add column source text not null default 'table' check (source in ('table', 'captain', 'system')),
  add column state_version int;

alter table public.score_submissions
  add column side text check (side in ('A', 'B'));

-- ---------------------------------------------------------------------------
-- Rate limiting (PIN attempts, public forms)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);
alter table public.rate_limits enable row level security;

-- Returns true when the call is allowed, false when the limit is reached.
create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  r public.rate_limits;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rl.count + 1 end,
    window_start = case when rl.window_start < now() - make_interval(secs => p_window_seconds) then now() else rl.window_start end
  returning * into r;
  return r.count <= p_max;
end $$;

-- ---------------------------------------------------------------------------
-- PIN check for volunteers without an account
-- ---------------------------------------------------------------------------
create or replace function public.verify_staff_pin(p_tournament uuid, p_pin text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.tournament_staff
  where tournament_id = p_tournament
    and revoked_at is null
    and pin_hash is not null
    and pin_hash = extensions.crypt(p_pin, pin_hash)
  limit 1
$$;

create or replace function public.hash_pin(p_pin text)
returns text language sql volatile security definer set search_path = '' as $$
  select extensions.crypt(p_pin, extensions.gen_salt('bf'))
$$;

-- ---------------------------------------------------------------------------
-- Atomic application of an organizer action computed by the draw engine
-- ---------------------------------------------------------------------------
create or replace function public.row_in_tournament(p_table text, p_key text, p_id uuid, p_tournament uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  ok boolean;
begin
  if p_table in ('teams', 'venues', 'rounds', 'matches', 'registrations') then
    execute format('select exists (select 1 from public.%I where %I = $1 and tournament_id = $2)', p_table, p_key) into ok using p_id, p_tournament;
  elsif p_table = 'players' then
    select exists (select 1 from public.players p join public.teams t on t.id = p.team_id where p.id = p_id and t.tournament_id = p_tournament) into ok;
  elsif p_table = 'team_secrets' then
    select exists (select 1 from public.teams t where t.id = p_id and t.tournament_id = p_tournament) into ok;
  elsif p_table = 'tournaments' then
    ok := p_id = p_tournament;
  else
    ok := false;
  end if;
  return ok;
end $$;

/*
 * p_changes: [{ table, op: insert|update|delete, key: "id"|"team_id", id, values }]
 * p_action:  { type, payload, inverse, client_op_id, actor_user_id, actor_staff_id,
 *              actor_label, source, undoes }
 * Returns { version, action_id, duplicate }.
 */
create or replace function public.apply_tournament_changes(
  p_tournament uuid,
  p_expected_version int,
  p_changes jsonb,
  p_action jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_version int;
  c jsonb;
  tbl text;
  op text;
  keycol text;
  cols text;
  sets text;
  existing record;
  new_action bigint;
begin
  -- Same client operation already applied (network retry): no-op.
  if p_action ? 'client_op_id' and p_action->>'client_op_id' is not null then
    select id, state_version into existing from public.tournament_actions
    where client_op_id = (p_action->>'client_op_id')::uuid;
    if found then
      return jsonb_build_object('version', existing.state_version, 'action_id', existing.id, 'duplicate', true);
    end if;
  end if;

  select state_version into current_version from public.tournaments where id = p_tournament for update;
  if not found then raise exception 'tournament_not_found'; end if;
  if current_version <> p_expected_version then
    raise exception 'version_conflict' using detail = current_version::text;
  end if;

  for c in select value from jsonb_array_elements(p_changes) loop
    tbl := c->>'table';
    op := c->>'op';
    keycol := coalesce(c->>'key', 'id');
    if tbl not in ('teams', 'players', 'venues', 'rounds', 'matches', 'team_secrets', 'registrations', 'tournaments') then
      raise exception 'table_not_allowed %', tbl;
    end if;
    if tbl = 'tournaments' and (op <> 'update' or exists (select 1 from jsonb_object_keys(c->'values') k where k <> 'status')) then
      raise exception 'tournament_change_not_allowed';
    end if;

    if op = 'insert' then
      if tbl in ('teams', 'venues', 'rounds', 'matches', 'registrations') and (c->'values'->>'tournament_id')::uuid is distinct from p_tournament then
        raise exception 'wrong_tournament';
      end if;
      select string_agg(quote_ident(k), ', ') into cols from jsonb_object_keys(c->'values') k;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', tbl, cols, cols, tbl)
        using c->'values';
      if not public.row_in_tournament(tbl, keycol, (c->>'id')::uuid, p_tournament) then raise exception 'wrong_tournament'; end if;
    elsif op = 'update' then
      if not public.row_in_tournament(tbl, keycol, (c->>'id')::uuid, p_tournament) then raise exception 'wrong_tournament'; end if;
      select string_agg(format('%I = r.%I', k, k), ', ') into sets from jsonb_object_keys(c->'values') k;
      execute format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) r where t.%I = $2', tbl, sets, tbl, keycol)
        using c->'values', (c->>'id')::uuid;
    elsif op = 'delete' then
      if not public.row_in_tournament(tbl, keycol, (c->>'id')::uuid, p_tournament) then continue; end if;
      execute format('delete from public.%I where %I = $1', tbl, keycol) using (c->>'id')::uuid;
    else
      raise exception 'bad_op %', op;
    end if;
  end loop;

  update public.tournaments set state_version = current_version + 1 where id = p_tournament;

  insert into public.tournament_actions (
    tournament_id, actor_user_id, actor_staff_id, actor_label, source, type, payload, changes, inverse, client_op_id, state_version
  ) values (
    p_tournament,
    nullif(p_action->>'actor_user_id', '')::uuid,
    nullif(p_action->>'actor_staff_id', '')::uuid,
    p_action->>'actor_label',
    coalesce(p_action->>'source', 'table'),
    p_action->>'type',
    coalesce(p_action->'payload', '{}'::jsonb),
    -- Engine-level changes when given (used to undo), else the DB changes.
    coalesce(p_action->'changes', p_changes),
    p_action->'inverse',
    nullif(p_action->>'client_op_id', '')::uuid,
    current_version + 1
  ) returning id into new_action;

  if p_action ? 'undoes' and p_action->>'undoes' is not null then
    update public.tournament_actions set undone_at = now(), undone_by_action = new_action
    where id = (p_action->>'undoes')::bigint and tournament_id = p_tournament;
  end if;

  return jsonb_build_object('version', current_version + 1, 'action_id', new_action, 'duplicate', false);
end $$;

-- Only trusted server code (service role) may call these.
revoke execute on function public.apply_tournament_changes(uuid, int, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.verify_staff_pin(uuid, text) from public, anon, authenticated;
revoke execute on function public.hash_pin(text) from public, anon, authenticated;
revoke execute on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;
revoke execute on function public.row_in_tournament(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_tournament_changes(uuid, int, jsonb, jsonb) to service_role;
grant execute on function public.verify_staff_pin(uuid, text) to service_role;
grant execute on function public.hash_pin(text) to service_role;
grant execute on function public.hit_rate_limit(text, int, int) to service_role;
grant execute on function public.row_in_tournament(text, text, uuid, uuid) to service_role;
