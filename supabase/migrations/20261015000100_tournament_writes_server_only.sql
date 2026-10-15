-- Tournament data is written only by the server (executeCommand -> apply_tournament_changes,
-- staff API, online registration), always with the service role. Client-side "for all"
-- policies let any staff member (a referee included) or club admin bypass the engine:
-- raw scores without history, revoked PIN re-enabled, self-promotion to organizer.
drop policy if exists "managers edit staff" on public.tournament_staff;
drop policy if exists "managers edit venues" on public.venues;
drop policy if exists "managers edit teams" on public.teams;
drop policy if exists "managers edit players" on public.players;
drop policy if exists "managers edit licenses" on public.players_private;
drop policy if exists "managers edit registrations" on public.registrations;
drop policy if exists "managers edit rounds" on public.rounds;
drop policy if exists "managers edit matches" on public.matches;

-- Contacts and licences: organizers only (platform admin, club owner/admin,
-- staff with the organizer or co_organizer role), not referees.
create or replace function public.can_see_tournament_private(p_tournament uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.tournaments t
      join public.club_members m on m.club_id = t.club_id
      where t.id = p_tournament and m.user_id = auth.uid() and m.role in ('owner', 'admin')
    )
    or exists (
      select 1 from public.tournament_staff s
      where s.tournament_id = p_tournament and s.user_id = auth.uid() and s.revoked_at is null
        and s.role in ('organizer', 'co_organizer')
    )
$$;

drop policy if exists "licenses: self and managers" on public.players_private;
create policy "licenses: self and organizers" on public.players_private
  for select using (
    exists (
      select 1 from public.players p join public.teams t on t.id = p.team_id
      where p.id = player_id and (p.user_id = auth.uid() or public.can_see_tournament_private(t.tournament_id))
    )
  );

drop policy if exists "registrations: owner and managers" on public.registrations;
create policy "registrations: owner and organizers" on public.registrations
  for select using (user_id = auth.uid() or public.can_see_tournament_private(tournament_id));

drop policy if exists "managers see staff" on public.tournament_staff;
create policy "organizers see staff" on public.tournament_staff
  for select using (public.can_see_tournament_private(tournament_id) or user_id = auth.uid());
