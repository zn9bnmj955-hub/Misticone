-- Lot 2 (B3): retention of the results, then purge of the personal data.
--
-- A tournament closed for good (status 'archived') is purged 14 days after its final
-- (finished_at). As a safety net, any published tournament that started more than 6 months
-- ago is purged too (promise shown on the registration form), even if it never finished.
--
-- Deleted: players (names), licences, registrations (contacts), team codes, staff (PIN,
-- emails, phones), the action history, captains' score submissions, notifications, follows
-- and the push subscriptions of that tournament. Team names are made anonymous.
-- Kept: payments and invoices, the `tournaments` row (its short code is never given out again,
-- generate_short_code checks this table), teams (number, status), rounds and matches
-- (anonymous counters). `purged_at` is then filled and the public page shows
-- « Résultats supprimés ».
--
-- Idempotent: a tournament already purged (purged_at not null) is never touched again.
-- Called every day by pg_cron in production (docs/DEPLOIEMENT.md) and by /api/cron/tick
-- (service role). Returns the short codes purged by this run.

create or replace function public.purge_finished_tournaments(p_now timestamptz default now())
returns text[] language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
  codes text[];
  subs uuid[];
begin
  with due as (
    select t.id, t.short_code
      from public.tournaments t
     where t.purged_at is null
       and t.status <> 'draft'
       and (
         (t.status = 'archived' and t.finished_at is not null and t.finished_at <= p_now - interval '14 days')
         or coalesce(t.starts_at, t.created_at) <= p_now - interval '6 months'
       )
       for update of t
  )
  select coalesce(array_agg(id order by id), '{}'), coalesce(array_agg(short_code order by id), '{}')
    into ids, codes from due;
  if cardinality(ids) = 0 then return '{}'; end if;

  -- Push subscriptions that followed these tournaments (directly or through a team).
  select coalesce(array_agg(distinct s.id), '{}') into subs
    from public.push_subscriptions s
   where s.tournament_id = any(ids)
      or s.team_id in (select id from public.teams where tournament_id = any(ids))
      or exists (select 1 from public.push_targets pt where pt.subscription_id = s.id and pt.tournament_id = any(ids));

  delete from public.notifications where tournament_id = any(ids);
  delete from public.push_targets where tournament_id = any(ids);
  -- A device without an account and with nothing left to follow is forgotten; a device of an
  -- account keeps its subscription for its other notifications, without the link to this tournament.
  delete from public.push_subscriptions s
   where s.id = any(subs) and s.user_id is null
     and not exists (select 1 from public.push_targets pt where pt.subscription_id = s.id);
  update public.push_subscriptions s set tournament_id = null, team_id = null
   where s.id = any(subs)
     and (s.tournament_id = any(ids) or s.team_id in (select id from public.teams where tournament_id = any(ids)));
  delete from public.follows where tournament_id = any(ids);

  delete from public.tournament_actions where tournament_id = any(ids);
  delete from public.score_submissions
   where match_id in (select id from public.matches where tournament_id = any(ids));
  delete from public.tournament_staff where tournament_id = any(ids);
  delete from public.registrations where tournament_id = any(ids);
  delete from public.team_secrets where team_id in (select id from public.teams where tournament_id = any(ids));
  -- players_private follows players (on delete cascade); deleted explicitly anyway.
  delete from public.players_private
   where player_id in (select p.id from public.players p join public.teams tm on tm.id = p.team_id where tm.tournament_id = any(ids));
  delete from public.players where team_id in (select id from public.teams where tournament_id = any(ids));
  update public.teams set name = null, club_name = null where tournament_id = any(ids);

  -- state_version + 1: the public pages rebuild their cached state and see the purge.
  update public.tournaments
     set purged_at = p_now, state_version = state_version + 1
   where id = any(ids);
  return codes;
end $$;

revoke all on function public.purge_finished_tournaments(timestamptz) from public, anon, authenticated;
grant execute on function public.purge_finished_tournaments(timestamptz) to service_role;
