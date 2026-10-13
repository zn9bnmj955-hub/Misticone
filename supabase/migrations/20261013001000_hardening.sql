-- OrgaSport — security hardening after the review of phases 3 and 4.

-- 1. Club members: an admin can never touch the owner, and nobody is added
--    to a club without accepting an invitation (inserts by the server only).
drop policy if exists "club admins add members" on public.club_members;
drop policy if exists "club admins change roles" on public.club_members;
drop policy if exists "members leave, admins remove" on public.club_members;
create policy "club admins change roles" on public.club_members
  for update using (public.is_club_admin(club_id) and role <> 'owner')
  with check (public.is_club_admin(club_id) and role <> 'owner');
create policy "members leave, admins remove" on public.club_members
  for delete using (role <> 'owner' and (user_id = auth.uid() or public.is_club_admin(club_id)));

-- 2. Tournaments: clients edit drafts only. Everything after publication goes
--    through server code (draw engine actions, service role), which keeps the
--    history, the privacy settings and the price that was paid.
drop policy if exists "managers edit tournaments" on public.tournaments;
create policy "members edit drafts" on public.tournaments
  for update using (status = 'draft' and (public.is_club_member(club_id) or public.can_manage_tournament(id)))
  with check (status = 'draft' and (public.is_club_member(club_id) or public.can_manage_tournament(id)));

-- 3. The draft form holds private contacts: once published, the frozen copy
--    stays on the payment row only.
update public.tournaments set draft_form = '{}'::jsonb, draft_step = null where status <> 'draft';

create or replace function public.clear_draft_on_publish()
returns trigger language plpgsql as $$
begin
  if new.status <> 'draft' then
    new.draft_form := '{}'::jsonb;
    new.draft_step := null;
  end if;
  return new;
end $$;
create trigger tournaments_clear_draft before insert or update on public.tournaments
  for each row execute function public.clear_draft_on_publish();

-- 4. Public buckets serve files by URL without any policy; a SELECT policy
--    only adds the ability to LIST the bucket (draft ids, unpublished files).
drop policy if exists "tournament media is public" on storage.objects;
drop policy if exists "club logos are public" on storage.objects;

-- 5. Online registrations: substitutes are flagged as such.
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
      category = nullif(pl ->> 'category', ''),
      is_substitute = coalesce((pl ->> 'substitute')::boolean, false)
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
