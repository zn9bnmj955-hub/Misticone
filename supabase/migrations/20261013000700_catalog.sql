-- OrgaSport — phase 4: catalog and online registration.

-- Online registrations are recorded in the action history like any other change.
alter table public.tournament_actions drop constraint if exists tournament_actions_source_check;
alter table public.tournament_actions
  add constraint tournament_actions_source_check check (source in ('table', 'captain', 'system', 'online'));

-- ---------------------------------------------------------------------------
-- Catalog query. Security invoker: RLS decides what each visitor may see
-- (published tournaments for everyone). Filters arrive as one JSON object so
-- the server can cache results per filter combination.
--   sports text[], from/to timestamptz, lat/lng + radius_km, format,
--   eligibility, category, has_places bool, statuses text[], sort 'date'|'distance',
--   limit (max 200), offset
-- ---------------------------------------------------------------------------
create or replace function public.catalog_tournaments(p jsonb default '{}'::jsonb)
returns table (
  id uuid,
  short_code text,
  name text,
  status public.tournament_status,
  sport_slug text,
  starts_at timestamptz,
  registration_closes_at timestamptz,
  address text,
  city text,
  postcode text,
  lat double precision,
  lng double precision,
  team_format text,
  category text,
  eligibility public.eligibility,
  registration_mode public.registration_mode,
  max_teams int,
  fee_cents int,
  fee_per text,
  prize_text text,
  format text,
  club_name text,
  club_slug text,
  active_teams int,
  waitlist_teams int,
  distance_km double precision
)
language sql stable security invoker set search_path = '' as $$
  with params as (
    select
      (select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'sports') = 'array' then p -> 'sports' end) x) as sports,
      (p ->> 'from')::timestamptz as d_from,
      (p ->> 'to')::timestamptz as d_to,
      (p ->> 'lat')::double precision as lat,
      (p ->> 'lng')::double precision as lng,
      (p ->> 'radius_km')::double precision as radius,
      p ->> 'format' as fmt,
      p ->> 'eligibility' as elig,
      p ->> 'category' as cat,
      coalesce((p ->> 'has_places')::boolean, false) as has_places,
      coalesce(
        (select array_agg(x::public.tournament_status) from jsonb_array_elements_text(case when jsonb_typeof(p -> 'statuses') = 'array' then p -> 'statuses' end) x),
        array['published', 'registration_closed', 'check_in', 'live']::public.tournament_status[]
      ) as statuses,
      least(greatest(coalesce((p ->> 'limit')::int, 50), 1), 200) as lim,
      greatest(coalesce((p ->> 'offset')::int, 0), 0) as off,
      coalesce(p ->> 'sort', 'date') as sort
  ),
  rows as (
    select
      t.id, t.short_code, t.name, t.status, t.sport_slug, t.starts_at, t.registration_closes_at,
      t.address, t.city, t.postcode, t.lat, t.lng, t.team_format, t.category, t.eligibility,
      t.registration_mode, t.max_teams, t.fee_cents, t.fee_per, t.prize_text,
      coalesce(t.config ->> 'format', s.config -> 'defaults' ->> 'competitionFormat') as format,
      c.name as club_name, c.slug as club_slug,
      (select count(*) from public.teams tm where tm.tournament_id = t.id and tm.status not in ('waitlist', 'withdrawn'))::int as active_teams,
      (select count(*) from public.teams tm where tm.tournament_id = t.id and tm.status = 'waitlist')::int as waitlist_teams,
      case when pr.lat is not null and pr.lng is not null and t.lat is not null and t.lng is not null
        then public.distance_km(pr.lat, pr.lng, t.lat, t.lng) end as distance_km,
      pr.sort, pr.lim, pr.off, pr.radius, pr.has_places
    from public.tournaments t
    join public.clubs c on c.id = t.club_id
    join public.sports s on s.slug = t.sport_slug
    cross join params pr
    where t.status <> 'draft'
      and t.status = any (pr.statuses)
      and (pr.sports is null or t.sport_slug = any (pr.sports))
      and (pr.d_from is null or t.starts_at >= pr.d_from)
      and (pr.d_to is null or t.starts_at < pr.d_to)
      and (pr.elig is null or t.eligibility::text = pr.elig)
      and (pr.cat is null or t.category = pr.cat)
      and (pr.fmt is null or coalesce(t.config ->> 'format', s.config -> 'defaults' ->> 'competitionFormat') = pr.fmt)
  )
  select
    r.id, r.short_code, r.name, r.status, r.sport_slug, r.starts_at, r.registration_closes_at,
    r.address, r.city, r.postcode, r.lat, r.lng, r.team_format, r.category, r.eligibility,
    r.registration_mode, r.max_teams, r.fee_cents, r.fee_per, r.prize_text, r.format,
    r.club_name, r.club_slug, r.active_teams, r.waitlist_teams, r.distance_km
  from rows r
  where (r.radius is null or (r.distance_km is not null and r.distance_km <= r.radius))
    and (not r.has_places or r.max_teams is null or r.active_teams < r.max_teams)
  order by
    case when r.sort = 'distance' then r.distance_km end asc nulls last,
    case when r.status = 'live' then 0 else 1 end,
    r.starts_at asc nulls last,
    r.id
  limit (select lim from params) offset (select off from params)
$$;
grant execute on function public.catalog_tournaments(jsonb) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Private part of an online registration (contacts, licenses, account links).
-- Written by the server right after the engine created the team.
-- ---------------------------------------------------------------------------
create or replace function public.register_team_private(p_team uuid, p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  pl jsonb;
begin
  update public.registrations set
    captain_name = nullif(p ->> 'captain_name', ''),
    captain_phone = nullif(p ->> 'captain_phone', ''),
    captain_email = nullif(lower(p ->> 'captain_email'), ''),
    user_id = nullif(p ->> 'user_id', '')::uuid,
    accepted_rules_at = (p ->> 'accepted_rules_at')::timestamptz,
    device_token_hash = nullif(p ->> 'device_token_hash', '')
  where team_id = p_team;
  if not found then raise exception 'registration_not_found'; end if;

  for pl in select * from jsonb_array_elements(coalesce(p -> 'players', '[]'::jsonb)) loop
    update public.players set
      user_id = coalesce(nullif(pl ->> 'user_id', '')::uuid, user_id),
      category = nullif(pl ->> 'category', '')
    where team_id = p_team and position = (pl ->> 'position')::int;
    if nullif(pl ->> 'license', '') is not null then
      insert into public.players_private (player_id, license_number)
      select id, pl ->> 'license' from public.players where team_id = p_team and position = (pl ->> 'position')::int
      on conflict (player_id) do update set license_number = excluded.license_number;
    end if;
  end loop;
end $$;
revoke execute on function public.register_team_private(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.register_team_private(uuid, jsonb) to service_role;
