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
select pg_temp.as_anon();
do $$ begin
  if (select count(*) from public.tournaments) <> 4 then raise exception 'anon should see 4 published tournaments'; end if;
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
  if (select redemptions from public.promo_codes where id = promo) <> 1 then raise exception 'promo redemption not counted once'; end if;
  if (select status from public.payments where id = pay) <> 'paid' then raise exception 'payment not marked paid'; end if;
end $$;
select pg_temp.reset();

\echo 'RLS checks passed'
rollback;
