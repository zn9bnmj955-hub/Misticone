-- Lot 2: cadrage, concours B and C, players' clubs (N.H.), one-time link (closing and purge).
-- Everything here is written by the server only (executeCommand -> apply_tournament_changes,
-- service role), like the rest of the tournament data since 20261015000100: no new client
-- write policy. apply_tournament_changes maps columns generically (jsonb_populate_record),
-- so it accepts the new columns as they are.

-- Concours C (consolation of the B).
alter type public.bracket_kind add value if not exists 'consolation_c';

-- Round kind: "cadrage" = the round that brings the field down to a power of two.
create type public.round_kind as enum ('partie', 'cadrage');
alter table public.rounds add column kind public.round_kind not null default 'partie';

-- Players' club: public (shown as "(n°/NOM DU CLUB)" or "(N.H.)"); the licence stays private.
alter table public.players
  add column club_number text check (club_number is null or length(club_number) <= 20),
  add column club_name text check (club_name is null or length(club_name) <= 120);

-- Brackets (B, C) a team entered on its own ("opt_in" entry).
alter table public.teams add column bracket_entries public.bracket_kind[] not null default '{}';

-- One-time link: end of the final, then purge of personal data (the row itself is kept so the
-- short code is never given out again).
alter table public.tournaments
  add column finished_at timestamptz,
  add column purged_at timestamptz;

create or replace function public.tournaments_guard_lifecycle()
returns trigger language plpgsql as $$
begin
  if (new.finished_at is distinct from old.finished_at or new.purged_at is distinct from old.purged_at)
     and coalesce(auth.role(), 'service_role') not in ('service_role')
     and not public.is_platform_admin() then
    raise exception 'finished_at and purged_at are set by the server only';
  end if;
  return new;
end $$;
create trigger tournaments_guard_lifecycle before update on public.tournaments
  for each row execute function public.tournaments_guard_lifecycle();

create or replace function public.tournaments_guard_lifecycle_insert()
returns trigger language plpgsql as $$
begin
  if (new.finished_at is not null or new.purged_at is not null)
     and coalesce(auth.role(), 'service_role') not in ('service_role')
     and not public.is_platform_admin() then
    raise exception 'finished_at and purged_at are set by the server only';
  end if;
  return new;
end $$;
create trigger tournaments_guard_lifecycle_insert before insert on public.tournaments
  for each row execute function public.tournaments_guard_lifecycle_insert();
