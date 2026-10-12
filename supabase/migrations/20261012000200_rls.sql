-- OrgaSport — Row Level Security
-- Rule of thumb:
--   * public catalog data (sports, clubs, published tournaments, venues,
--     rounds, matches, teams) is readable by everyone;
--   * personal data (players, registrations, *_private) is readable only by
--     the person concerned and the tournament managers. Public pages get
--     player names through the server, which applies "initials" masking;
--   * writes that must be trusted (publishing, payments, notifications,
--     action history) go through server code using the service role.

alter table public.platform_admins enable row level security;
alter table public.app_settings enable row level security;
alter table public.legal_pages enable row level security;
alter table public.sports enable row level security;
alter table public.clubs enable row level security;
alter table public.profiles enable row level security;
alter table public.profiles_private enable row level security;
alter table public.club_members enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_staff enable row level security;
alter table public.venues enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.players_private enable row level security;
alter table public.registrations enable row level security;
alter table public.rounds enable row level security;
alter table public.matches enable row level security;
alter table public.score_submissions enable row level security;
alter table public.tournament_actions enable row level security;
alter table public.follows enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.pricing_plans enable row level security;
alter table public.payments enable row level security;
alter table public.announcements enable row level security;
alter table public.news_sources enable row level security;
alter table public.news_items enable row level security;
alter table public.kb_documents enable row level security;
alter table public.kb_chunks enable row level security;
alter table public.ai_usage enable row level security;

-- Platform ------------------------------------------------------------------
create policy "admins see themselves" on public.platform_admins
  for select using (user_id = auth.uid());

create policy "admins manage settings" on public.app_settings
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "legal pages are public" on public.legal_pages
  for select using (published or public.is_platform_admin());
create policy "admins edit legal pages" on public.legal_pages
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Sports ----------------------------------------------------------------------
create policy "sports are public" on public.sports for select using (true);
create policy "admins edit sports" on public.sports
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Clubs -----------------------------------------------------------------------
create policy "clubs are public" on public.clubs for select using (true);
create policy "signed-in users create clubs" on public.clubs
  for insert to authenticated with check (created_by = auth.uid());
create policy "club admins edit their club" on public.clubs
  for update using (public.is_club_admin(id)) with check (public.is_club_admin(id));
create policy "club owners delete their club" on public.clubs
  for delete using (public.club_role_of(id) = 'owner' or public.is_platform_admin());

create policy "members see their club roster" on public.club_members
  for select using (user_id = auth.uid() or public.is_club_member(club_id));
create policy "club admins add members" on public.club_members
  for insert with check (public.is_club_admin(club_id) and role <> 'owner');
create policy "club admins change roles" on public.club_members
  for update using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id) and role <> 'owner');
create policy "members leave, admins remove" on public.club_members
  for delete using ((user_id = auth.uid() and role <> 'owner') or public.is_club_admin(club_id));

-- Profiles --------------------------------------------------------------------
create policy "own profile" on public.profiles
  for select using (id = auth.uid() or public.is_platform_admin());
create policy "edit own profile" on public.profiles
  for update using (id = auth.uid()) with check (
    id = auth.uid()
    and (active_club_id is null or public.is_club_member(active_club_id))
  );

create policy "own private data" on public.profiles_private
  for select using (user_id = auth.uid());
create policy "edit own private data" on public.profiles_private
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own follows" on public.follows
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tournaments -----------------------------------------------------------------
create policy "published tournaments are public" on public.tournaments
  for select using (status <> 'draft' or public.can_manage_tournament(id) or public.is_club_member(club_id));
create policy "club members create drafts" on public.tournaments
  for insert to authenticated with check (public.is_club_member(club_id) and created_by = auth.uid());
create policy "managers edit tournaments" on public.tournaments
  for update using (public.can_manage_tournament(id) or public.is_club_member(club_id))
  with check (public.can_manage_tournament(id) or public.is_club_member(club_id));
create policy "drafts can be deleted" on public.tournaments
  for delete using (status = 'draft' and public.is_club_admin(club_id));

-- PIN hashes are never readable through the API.
revoke select on public.tournament_staff from anon, authenticated;
grant select (id, tournament_id, user_id, role, label, email, phone, created_at, revoked_at)
  on public.tournament_staff to authenticated;
create policy "managers see staff" on public.tournament_staff
  for select using (public.can_manage_tournament(tournament_id) or user_id = auth.uid());
create policy "managers edit staff" on public.tournament_staff
  for all using (public.can_manage_tournament(tournament_id))
  with check (public.can_manage_tournament(tournament_id));

create policy "venues are public" on public.venues
  for select using (public.is_tournament_public(tournament_id) or public.can_manage_tournament(tournament_id));
create policy "managers edit venues" on public.venues
  for all using (public.can_manage_tournament(tournament_id))
  with check (public.can_manage_tournament(tournament_id));

create policy "teams are public" on public.teams
  for select using (public.is_tournament_public(tournament_id) or public.can_manage_tournament(tournament_id));
create policy "managers edit teams" on public.teams
  for all using (public.can_manage_tournament(tournament_id))
  with check (public.can_manage_tournament(tournament_id));

create policy "players: self and managers" on public.players
  for select using (
    user_id = auth.uid()
    or public.can_manage_tournament((select t.tournament_id from public.teams t where t.id = team_id))
  );
create policy "managers edit players" on public.players
  for all using (public.can_manage_tournament((select t.tournament_id from public.teams t where t.id = team_id)))
  with check (public.can_manage_tournament((select t.tournament_id from public.teams t where t.id = team_id)));

create policy "licenses: self and managers" on public.players_private
  for select using (
    exists (
      select 1 from public.players p join public.teams t on t.id = p.team_id
      where p.id = player_id and (p.user_id = auth.uid() or public.can_manage_tournament(t.tournament_id))
    )
  );
create policy "managers edit licenses" on public.players_private
  for all using (
    exists (
      select 1 from public.players p join public.teams t on t.id = p.team_id
      where p.id = player_id and public.can_manage_tournament(t.tournament_id)
    )
  ) with check (
    exists (
      select 1 from public.players p join public.teams t on t.id = p.team_id
      where p.id = player_id and public.can_manage_tournament(t.tournament_id)
    )
  );

create policy "registrations: owner and managers" on public.registrations
  for select using (user_id = auth.uid() or public.can_manage_tournament(tournament_id));
create policy "managers edit registrations" on public.registrations
  for all using (public.can_manage_tournament(tournament_id))
  with check (public.can_manage_tournament(tournament_id));

create policy "rounds are public" on public.rounds
  for select using (public.is_tournament_public(tournament_id) or public.can_manage_tournament(tournament_id));
create policy "managers edit rounds" on public.rounds
  for all using (public.can_manage_tournament(tournament_id))
  with check (public.can_manage_tournament(tournament_id));

create policy "matches are public" on public.matches
  for select using (public.is_tournament_public(tournament_id) or public.can_manage_tournament(tournament_id));
create policy "managers edit matches" on public.matches
  for all using (public.can_manage_tournament(tournament_id))
  with check (public.can_manage_tournament(tournament_id));

create policy "score submissions: managers" on public.score_submissions
  for select using (
    public.can_manage_tournament((select m.tournament_id from public.matches m where m.id = match_id))
    or submitted_by_user = auth.uid()
  );

-- History is written by the server only, read by managers.
create policy "managers read history" on public.tournament_actions
  for select using (public.can_manage_tournament(tournament_id));

-- Notifications ----------------------------------------------------------------
create policy "own push subscriptions" on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy "delete own push subscriptions" on public.push_subscriptions
  for delete using (user_id = auth.uid());
create policy "own notifications" on public.notifications
  for select using (user_id = auth.uid());

-- Payments --------------------------------------------------------------------
create policy "active plans are public" on public.pricing_plans
  for select using (active or public.is_platform_admin());
create policy "admins edit plans" on public.pricing_plans
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "club members see their payments" on public.payments
  for select using (public.is_club_member(club_id));

-- Content ---------------------------------------------------------------------
create policy "published announcements are public" on public.announcements
  for select using (published_at is not null and published_at <= now() or public.is_club_member(club_id));
create policy "club admins write announcements" on public.announcements
  for all using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));

create policy "news sources are public" on public.news_sources for select using (enabled or public.is_platform_admin());
create policy "admins edit news sources" on public.news_sources
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "news items are public" on public.news_items for select using (true);

create policy "published kb is public" on public.kb_documents
  for select using (published or public.is_platform_admin());
create policy "admins edit kb" on public.kb_documents
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "published kb chunks are public" on public.kb_chunks
  for select using (exists (select 1 from public.kb_documents d where d.id = document_id and (d.published or public.is_platform_admin())));

create policy "own ai usage" on public.ai_usage
  for select using (user_id = auth.uid() or public.is_platform_admin());
