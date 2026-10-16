-- Row Level Security checks. Run with `pnpm test:db` (needs the local stack
-- and the demo seed). Each block raises an exception if a rule is broken;
-- everything runs in a transaction that is rolled back.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
declare uid uuid;
begin
  select id into uid from auth.users where email = p_email;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;

create or replace function pg_temp.reset() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- 1. Anonymous visitors see published tournaments but no personal data.
-- Independent of the tournaments the e2e tests publish: a draft is added here
-- (rolled back), and anon must see exactly the non-draft ones, demo codes included.
do $$ begin
  insert into public.tournaments (club_id, sport_slug, name, created_by)
    select club_id, sport_slug, 'Brouillon test RLS', created_by from public.tournaments where short_code = 'GP3M';
  perform set_config('rls_test.public_count', (select count(*) from public.tournaments where status <> 'draft')::text, true);
end $$;
select pg_temp.as_anon();
do $$ begin
  if (select count(*) from public.tournaments) <> current_setting('rls_test.public_count')::int then
    raise exception 'anon should see exactly the published (non-draft) tournaments';
  end if;
  if exists (select 1 from public.tournaments where status = 'draft') then raise exception 'anon must not see drafts'; end if;
  if (select count(*) from public.tournaments where short_code in ('7KQ2', 'GP3M', 'TR8E', 'FT8S')) <> 4 then
    raise exception 'anon should see the 4 demo tournaments';
  end if;
  if (select count(*) from public.matches) = 0 then raise exception 'anon should see matches'; end if;
  if (select count(*) from public.players) <> 0 then raise exception 'anon must not read players'; end if;
  if (select count(*) from public.registrations) <> 0 then raise exception 'anon must not read registrations'; end if;
  if (select count(*) from public.players_private) <> 0 then raise exception 'anon must not read licenses'; end if;
  if (select count(*) from public.profiles) <> 0 then raise exception 'anon must not read profiles'; end if;
end $$;
select pg_temp.reset();

-- 2. A player sees only their own player row and registration.
select pg_temp.as_user('joueur@demo.orgasport.fr');
do $$ begin
  if (select count(*) from public.players) <> 1 then raise exception 'player should see exactly their own player row'; end if;
  if (select count(*) from public.players_private) <> 1 then raise exception 'player should see only their own license'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'player should see only their profile'; end if;
end $$;
-- ...cannot switch to a club they are not a member of.
do $$ begin
  begin
    update public.profiles set active_club_id = (select id from public.clubs limit 1) where id = auth.uid();
    raise exception 'player switched to a foreign club';
  exception when insufficient_privilege or check_violation then null;
  end;
  if exists (select 1 from public.profiles where id = auth.uid() and active_club_id is not null) then
    raise exception 'foreign club switch persisted';
  end if;
end $$;
-- ...cannot create a tournament for a club.
do $$ begin
  begin
    insert into public.tournaments (club_id, sport_slug, name, created_by)
    values ((select id from public.clubs limit 1), 'petanque', 'Intrus', auth.uid());
    raise exception 'player created a tournament';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.reset();

-- 3. The club owner manages its tournaments but cannot publish without payment.
select pg_temp.as_user('club@demo.orgasport.fr');
do $$
declare tid uuid;
begin
  if (select count(*) from public.players) < 200 then raise exception 'club should see its players'; end if;
  insert into public.tournaments (club_id, sport_slug, name, created_by)
  values ((select id from public.clubs where slug = 'as-les-platanes'), 'petanque', 'Brouillon de test', auth.uid())
  returning id into tid;
  if (select status from public.tournaments where id = tid) <> 'draft' then raise exception 'new tournament should be a draft'; end if;
  if (select short_code from public.tournaments where id = tid) is null then raise exception 'short code should be generated'; end if;
  begin
    update public.tournaments set status = 'published' where id = tid;
    raise exception 'club published without payment';
  exception when raise_exception then
    if sqlerrm not like '%payment%' then raise; end if;
  end;
end $$;
-- ...never reads PIN hashes.
do $$ begin
  begin
    perform pin_hash from public.tournament_staff;
    raise exception 'pin_hash readable';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.reset();

-- 4. A plain member cannot add people to the club nor promote themselves.
select set_config('test.player_id', (select id::text from auth.users where email = 'joueur@demo.orgasport.fr'), true);
select pg_temp.as_user('benevole@demo.orgasport.fr');
do $$ begin
  begin
    insert into public.club_members (club_id, user_id, role)
    values ((select id from public.clubs where slug = 'as-les-platanes'), current_setting('test.player_id')::uuid, 'member');
    raise exception 'member added someone to the club';
  exception when insufficient_privilege then null;
  end;
  update public.club_members set role = 'admin' where user_id = auth.uid();
  if exists (select 1 from public.club_members where user_id = auth.uid() and role = 'admin') then
    raise exception 'member promoted themselves';
  end if;
end $$;
select pg_temp.reset();

-- 5. Phase 2: team score codes and the write function are server-only.
select pg_temp.as_anon();
do $$ begin
  if (select count(*) from public.team_secrets) <> 0 then raise exception 'anon must not read team codes'; end if;
  if (select count(*) from public.tournament_actions) <> 0 then raise exception 'anon must not read history'; end if;
  begin
    perform public.apply_tournament_changes(gen_random_uuid(), 0, '[]'::jsonb, '{}'::jsonb);
    raise exception 'anon called apply_tournament_changes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.verify_staff_pin(gen_random_uuid(), '4821');
    raise exception 'anon called verify_staff_pin';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.reset();
select pg_temp.as_user('joueur@demo.orgasport.fr');
do $$ begin
  if (select count(*) from public.team_secrets) <> 0 then raise exception 'player must not read team codes'; end if;
  begin
    perform public.apply_tournament_changes(gen_random_uuid(), 0, '[]'::jsonb, '{}'::jsonb);
    raise exception 'player called apply_tournament_changes';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.reset();
select pg_temp.as_user('club@demo.orgasport.fr');
do $$ begin
  if (select count(*) from public.team_secrets) = 0 then raise exception 'organizer should read team codes'; end if;
end $$;
select pg_temp.reset();

-- 6. Phase 3: promo codes, invitations, payments and publication are server-only.
select pg_temp.as_anon();
do $$ begin
  if (select count(*) from public.promo_codes) <> 0 then raise exception 'anon must not read promo codes'; end if;
  if (select count(*) from public.payments) <> 0 then raise exception 'anon must not read payments'; end if;
  if exists (select 1 from public.tournaments where status = 'draft') then raise exception 'anon must not see drafts'; end if;
end $$;
select pg_temp.reset();

select pg_temp.as_user('club@demo.orgasport.fr');
do $$ begin
  if (select count(*) from public.promo_codes) <> 0 then raise exception 'clubs must not list promo codes'; end if;
  if not exists (select 1 from public.tournaments where status = 'draft') then raise exception 'club should see its draft'; end if;
  begin
    perform token_hash from public.club_invitations;
    raise exception 'invitation tokens readable';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.payments (tournament_id, club_id, amount_cents, status)
      select id, club_id, 0, 'paid' from public.tournaments where status = 'draft' limit 1;
    raise exception 'a club created its own payment';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.publish_tournament(gen_random_uuid(), '{}'::jsonb, '[]'::jsonb, '[]'::jsonb);
    raise exception 'publish_tournament callable by a club';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name, owner) values ('tournament-media', 'x/poster.png', auth.uid());
    raise exception 'direct uploads to tournament media allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.reset();

select pg_temp.as_user('admin@demo.orgasport.fr');
do $$ begin
  if (select count(*) from public.promo_codes) < 2 then raise exception 'admins should list promo codes'; end if;
end $$;
select pg_temp.reset();

-- Publication by the service role: atomic, idempotent, PINs hashed, promo counted.
do $$
declare
  t uuid := (select id from public.tournaments where status = 'draft' limit 1);
  c uuid := (select club_id from public.tournaments where status = 'draft' limit 1);
  promo uuid := (select id from public.promo_codes where code = 'BIENVENUE');
  -- The e2e tests also use BIENVENUE: count from the current value.
  used_before int := (select redemptions from public.promo_codes where code = 'BIENVENUE');
  pay uuid;
  r text;
begin
  insert into public.payments (tournament_id, club_id, amount_cents, status, provider, promo_code_id)
    values (t, c, 0, 'pending', 'free', promo) returning id into pay;
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  r := public.publish_tournament(pay,
    jsonb_build_object('name', 'Concours publié', 'starts_at', now() + interval '7 days', 'city', 'Aubagne', 'max_teams', 32),
    '[{"label":"1","position":1},{"label":"Honneur","position":2,"reserved":true}]'::jsonb,
    '[{"role":"co_organizer","label":"Bénévole 1","pin":"123456"},{"role":"co_organizer","label":"co","email":"benevole@demo.orgasport.fr"}]'::jsonb);
  if r <> 'published' then raise exception 'expected published, got %', r; end if;
  if public.publish_tournament(pay, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb) <> 'already_published' then raise exception 'not idempotent'; end if;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  if (select status from public.tournaments where id = t) <> 'published' then raise exception 'tournament not published'; end if;
  if (select count(*) from public.venues where tournament_id = t) <> 2 then raise exception 'venues not created'; end if;
  if (select pin_hash from public.tournament_staff where tournament_id = t and label = 'Bénévole 1') in (null, '123456') then raise exception 'PIN not hashed'; end if;
  if (select user_id from public.tournament_staff where tournament_id = t and label = 'co') is null then raise exception 'co-organizer with a confirmed account not linked'; end if;
  if (select redemptions from public.promo_codes where id = promo) <> used_before + 1 then raise exception 'promo redemption not counted once'; end if;
  if (select status from public.payments where id = pay) <> 'paid' then raise exception 'payment not marked paid'; end if;
end $$;
select pg_temp.reset();

-- 7. Hardening (review of phases 3-4).
-- A club admin cannot demote or remove the owner, nor add someone directly.
do $$
declare
  c uuid := (select id from public.clubs where slug = 'as-les-platanes');
  owner uuid := (select user_id from public.club_members where club_id = c and role = 'owner');
  vol uuid := (select id from auth.users where email = 'benevole@demo.orgasport.fr');
  pl uuid := (select id from auth.users where email = 'joueur@demo.orgasport.fr');
  n int;
begin
  update public.club_members set role = 'admin' where club_id = c and user_id = vol;
  perform pg_temp.as_user('benevole@demo.orgasport.fr');
  update public.club_members set role = 'member' where club_id = c and user_id = owner;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'an admin demoted the owner'; end if;
  delete from public.club_members where club_id = c and user_id = owner;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'an admin removed the owner'; end if;
  begin
    insert into public.club_members (club_id, user_id, role) values (c, pl, 'member');
    raise exception 'an admin added a member without invitation';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.reset();
end $$;
-- A member cannot edit a published tournament directly.
select pg_temp.as_user('benevole@demo.orgasport.fr');
do $$
declare n int;
begin
  update public.tournaments set name_display = 'full', max_teams = 999 where short_code = '7KQ2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a member edited a published tournament'; end if;
end $$;
select pg_temp.reset();
-- Published tournaments never expose the draft form (private contacts).
do $$ begin
  update public.tournaments set draft_form = '{"organizer":{"email":"x@y.z"}}' where short_code = 'GP3M';
  if (select draft_form from public.tournaments where short_code = 'GP3M') <> '{}'::jsonb then
    raise exception 'draft form kept on a published tournament';
  end if;
end $$;
-- Media buckets cannot be listed by visitors.
select pg_temp.as_anon();
do $$ begin
  if exists (select 1 from storage.objects where bucket_id in ('tournament-media', 'club-logos')) then
    raise exception 'anon can list media buckets';
  end if;
end $$;
select pg_temp.reset();

-- Tournament data is written by the server only: a referee or a club admin cannot bypass the engine.
do $$
declare
  tid uuid := (select id from public.tournaments where short_code = '7KQ2');
  vol uuid := (select id from auth.users where email = 'benevole@demo.orgasport.fr');
  n int;
begin
  update public.club_members set role = 'member' where user_id = vol;
  insert into public.tournament_staff (tournament_id, user_id, role, label) values (tid, vol, 'referee', 'Arbitre test');
  perform pg_temp.as_user('benevole@demo.orgasport.fr');
  update public.tournament_staff set revoked_at = null, role = 'organizer' where tournament_id = tid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a referee edited staff rows'; end if;
  update public.matches set score_a = 13, score_b = 0 where tournament_id = tid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a referee wrote raw scores'; end if;
  begin
    insert into public.teams (tournament_id, number, name) values (tid, 999, 'Intrus');
    raise exception 'a referee inserted a team';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.registrations where tournament_id = tid and user_id is distinct from vol) <> 0 then raise exception 'a referee read contacts'; end if;
  if exists (select 1 from public.players_private pp join public.players p on p.id = pp.player_id
             join public.teams t on t.id = p.team_id where t.tournament_id = tid and p.user_id is distinct from vol) then
    raise exception 'a referee read licences';
  end if;
  perform pg_temp.reset();
  perform pg_temp.as_user('club@demo.orgasport.fr');
  if (select count(*) from public.registrations where tournament_id = tid) = 0 then raise exception 'club admin should read contacts'; end if;
  update public.matches set score_a = 13, score_b = 0 where tournament_id = tid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a club admin wrote raw scores'; end if;
  delete from public.tournament_staff where tournament_id = tid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'a club admin deleted staff rows directly'; end if;
  perform pg_temp.reset();
end $$;

-- Lot 2: B/C entries, round kind, players' clubs, closing and purge dates are written by the server only.
do $$
declare
  tid uuid := (select id from public.tournaments where short_code = '7KQ2');
  draft uuid;
  n int;
  who text;
  r jsonb;
  team uuid := (select id from public.teams where tournament_id = (select id from public.tournaments where short_code = '7KQ2') order by number limit 1);
  pl uuid := (select p.id from public.players p where p.team_id = (select id from public.teams where tournament_id = (select id from public.tournaments where short_code = '7KQ2') order by number limit 1) order by position limit 1);
  rnd uuid := (select id from public.rounds where tournament_id = (select id from public.tournaments where short_code = '7KQ2') limit 1);
  v int := (select state_version from public.tournaments where short_code = '7KQ2');
begin
  foreach who in array array['benevole@demo.orgasport.fr', 'club@demo.orgasport.fr', 'joueur@demo.orgasport.fr'] loop
    perform pg_temp.as_user(who);
    update public.teams set bracket_entries = array['consolation', 'consolation_c']::public.bracket_kind[] where tournament_id = tid;
    get diagnostics n = row_count;
    if n <> 0 then raise exception '% entered teams in the B/C directly', who; end if;
    update public.rounds set kind = 'cadrage' where tournament_id = tid;
    get diagnostics n = row_count;
    if n <> 0 then raise exception '% changed a round kind directly', who; end if;
    update public.players set club_number = '0000000', club_name = 'Intrus' where team_id = team;
    get diagnostics n = row_count;
    if n <> 0 then raise exception '% changed a player club directly', who; end if;
    update public.tournaments set finished_at = now(), purged_at = now() where id = tid;
    get diagnostics n = row_count;
    if n <> 0 then raise exception '% closed a tournament directly', who; end if;
    perform pg_temp.reset();
  end loop;

  -- Even on a draft (editable by its club), the closing and purge dates stay server-only.
  select id into draft from public.tournaments
  where status = 'draft' and club_id = (select club_id from public.tournaments where id = tid) limit 1;
  if draft is null then
    insert into public.tournaments (club_id, sport_slug, name, status)
    select club_id, sport_slug, 'Brouillon test', 'draft' from public.tournaments where id = tid returning id into draft;
  end if;
  perform pg_temp.as_user('club@demo.orgasport.fr');
  update public.tournaments set name = 'Brouillon modifié' where id = draft;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'the club should edit its draft'; end if;
  begin
    update public.tournaments set finished_at = now() where id = draft;
    raise exception 'a club member set finished_at on a draft';
  exception when raise_exception then
    if sqlerrm not like '%server only%' then raise; end if;
  end;
  perform pg_temp.reset();

  -- Players' clubs are public; anon reads them like the rest of the player row.
  perform pg_temp.as_anon();
  perform club_number, club_name from public.players limit 1;
  perform kind from public.rounds limit 1;
  perform pg_temp.reset();

  -- The server (service role) writes the new columns through apply_tournament_changes.
  perform set_config('role', 'service_role', true);
  r := public.apply_tournament_changes(tid, v, jsonb_build_array(
    jsonb_build_object('table', 'teams', 'op', 'update', 'key', 'id', 'id', team, 'values', jsonb_build_object('bracket_entries', jsonb_build_array('consolation', 'consolation_c'))),
    jsonb_build_object('table', 'players', 'op', 'update', 'key', 'id', 'id', pl, 'values', jsonb_build_object('club_number', '0340901', 'club_name', 'BOULE DU CAP AGDE')),
    jsonb_build_object('table', 'rounds', 'op', 'update', 'key', 'id', 'id', rnd, 'values', jsonb_build_object('kind', 'cadrage'))
  ), jsonb_build_object('type', 'test.lot2', 'source', 'table'));
  perform pg_temp.reset();
  if (select bracket_entries from public.teams where id = team) <> array['consolation', 'consolation_c']::public.bracket_kind[] then raise exception 'B/C entries not written by the server'; end if;
  if (select club_number from public.players where id = pl) <> '0340901' then raise exception 'player club not written by the server'; end if;
  if (select kind from public.rounds where id = rnd) <> 'cadrage' then raise exception 'round kind not written by the server'; end if;
end $$;

-- Live updates: anyone may listen to "tournament:CODE" (private channel), only the server may send.
do $$
declare who text;
begin
  if exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
             and cmd in ('INSERT', 'ALL', 'UPDATE')) then
    raise exception 'a client write policy exists on realtime.messages';
  end if;
  foreach who in array array['anon', 'benevole@demo.orgasport.fr', 'club@demo.orgasport.fr'] loop
    if who = 'anon' then perform pg_temp.as_anon(); else perform pg_temp.as_user(who); end if;
    perform set_config('realtime.topic', 'tournament:7KQ2', true);
    if not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and cmd = 'SELECT') then
      raise exception 'nobody can listen to tournament updates';
    end if;
    begin
      insert into realtime.messages (topic, extension, event, payload, private)
        values ('tournament:7KQ2', 'broadcast', 'update', '{"version": 999999999}', true);
      raise exception '% sent a fake tournament update', who;
    exception when insufficient_privilege then null;
    end;
    perform pg_temp.reset();
  end loop;
end $$;

-- Lot 2 (B1): the engine's real write path is an INSERT of a full row (entityToRow): the server
-- inserts a "cadrage" round of the concours C; a client can neither do that nor create a
-- tournament that is already closed or purged.
do $$
declare
  tid uuid := (select id from public.tournaments where short_code = '7KQ2');
  rid uuid := gen_random_uuid();
  draft uuid;
  n int;
begin
  perform set_config('role', 'service_role', true);
  perform public.apply_tournament_changes(tid, (select state_version from public.tournaments where id = tid), jsonb_build_array(
    jsonb_build_object('table', 'rounds', 'op', 'insert', 'key', 'id', 'id', rid, 'values', jsonb_build_object(
      'id', rid, 'tournament_id', tid, 'bracket', 'consolation_c', 'phase', 'elimination', 'kind', 'cadrage',
      'number', 2, 'status', 'drawn', 'seed', 'b1', 'drawn_at', now()))
  ), jsonb_build_object('type', 'test.lot2.insert', 'source', 'table'));
  perform pg_temp.reset();
  if not exists (select 1 from public.rounds where id = rid and bracket = 'consolation_c' and kind = 'cadrage') then
    raise exception 'the server could not insert a cadrage round of the concours C';
  end if;

  perform pg_temp.as_user('club@demo.orgasport.fr');
  begin
    insert into public.rounds (tournament_id, bracket, phase, kind, number) values (tid, 'consolation_c', 'elimination', 'cadrage', 9);
    raise exception 'a club member inserted a round directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tournaments (club_id, sport_slug, name, status, created_by, finished_at)
    select club_id, sport_slug, 'Déjà clos', 'draft', auth.uid(), now() from public.tournaments where id = tid;
    raise exception 'a club member created a tournament with finished_at';
  exception when raise_exception then
    if sqlerrm not like '%server only%' then raise; end if;
  end;
  begin
    insert into public.tournaments (club_id, sport_slug, name, status, created_by, purged_at)
    select club_id, sport_slug, 'Déjà purgé', 'draft', auth.uid(), now() from public.tournaments where id = tid;
    raise exception 'a club member created a tournament with purged_at';
  exception when raise_exception then
    if sqlerrm not like '%server only%' then raise; end if;
  end;
  perform pg_temp.reset();
end $$;

-- Lot 2 (B1): with a real service-role JWT (as the web server sends it), apply_tournament_changes
-- writes finished_at together with the status (B2: set when the engine reaches "finished", cleared
-- when it goes back to "live", in the same atomic action); a club member cannot call the function.
do $$
declare
  tid uuid := (select id from public.tournaments where short_code = '7KQ2');
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform public.apply_tournament_changes(tid, (select state_version from public.tournaments where id = tid), jsonb_build_array(
    jsonb_build_object('table', 'tournaments', 'op', 'update', 'key', 'id', 'id', tid, 'values',
      jsonb_build_object('status', 'finished', 'finished_at', '2026-10-12T18:00:00Z'))
  ), jsonb_build_object('type', 'test.lot2.lifecycle', 'source', 'table'));
  perform pg_temp.reset();
  if (select finished_at from public.tournaments where id = tid) is distinct from '2026-10-12T18:00:00Z'::timestamptz then
    raise exception 'the server could not write finished_at through apply_tournament_changes';
  end if;
  -- purged_at stays reserved to the purge function (B3): the engine path refuses it.
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    perform public.apply_tournament_changes(tid, (select state_version from public.tournaments where id = tid), jsonb_build_array(
      jsonb_build_object('table', 'tournaments', 'op', 'update', 'key', 'id', 'id', tid, 'values',
        jsonb_build_object('status', 'archived', 'purged_at', '2026-10-12T18:00:00Z'))
    ), jsonb_build_object('type', 'test.lot2.lifecycle', 'source', 'table'));
    raise exception 'apply_tournament_changes accepted purged_at';
  exception when others then
    if sqlerrm <> 'tournament_change_not_allowed' then raise; end if;
  end;
  perform pg_temp.reset();
  if (select purged_at from public.tournaments where id = tid) is not null then
    raise exception 'purged_at was written through apply_tournament_changes';
  end if;

  perform pg_temp.as_user('club@demo.orgasport.fr');
  begin
    perform public.apply_tournament_changes(tid, (select state_version from public.tournaments where id = tid), jsonb_build_array(
      jsonb_build_object('table', 'tournaments', 'op', 'update', 'key', 'id', 'id', tid, 'values', jsonb_build_object('finished_at', null))
    ), jsonb_build_object('type', 'test.lot2.lifecycle', 'source', 'table'));
    raise exception 'a club member called apply_tournament_changes';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.reset();
end $$;

\echo 'RLS checks passed'
rollback;
