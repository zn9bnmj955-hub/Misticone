-- apply_tournament_changes: on `tournaments`, the server may now write `finished_at`
-- together with `status` in the same action (the tournament ends -> its end time is stored).
-- Only change from 20261012000400_draw_engine.sql: allowed keys on `tournaments` are
-- ('status', 'finished_at'). `update` stays the only operation allowed on that table;
-- `purged_at` stays forbidden (written by the purge's own function). Execution rights
-- unchanged: service role only.

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
    if tbl = 'tournaments' and (op <> 'update' or exists (select 1 from jsonb_object_keys(c->'values') k where k not in ('status', 'finished_at'))) then
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

revoke execute on function public.apply_tournament_changes(uuid, int, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_tournament_changes(uuid, int, jsonb, jsonb) to service_role;
