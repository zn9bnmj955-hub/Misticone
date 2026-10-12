-- OrgaSport — phase 5: notifications ("À vous de jouer") and news feed.
--
-- A device (push_subscriptions, one row per browser endpoint) can follow
-- several teams in several tournaments (push_targets), with or without an
-- account. Everything here is written by server code (service role).

create table public.push_targets (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (subscription_id, tournament_id, team_id)
);
create index on public.push_targets (team_id);
create index on public.push_targets (tournament_id);
alter table public.push_targets enable row level security;
create policy "own push targets" on public.push_targets
  for select using (exists (select 1 from public.push_subscriptions s where s.id = subscription_id and s.user_id = auth.uid()));

alter table public.push_subscriptions
  add column failed_count int not null default 0,
  add column last_success_at timestamptz,
  add column updated_at timestamptz not null default now();
create trigger set_updated_at before update on public.push_subscriptions for each row execute function public.set_updated_at();

-- Notification queue: rendered text, deduplicated (the same event never
-- notifies the same device twice), retried by the scheduler.
alter table public.notifications
  add column dedupe_key text,
  add column team_id uuid references public.teams (id) on delete cascade,
  add column title text,
  add column body text,
  add column url text;
create unique index notifications_dedupe_key on public.notifications (dedupe_key);
create index on public.notifications (tournament_id, created_at desc);

-- Feed: recent clubs and results are read through public tables; news items
-- keep only title, source and link (never the article itself).
create index on public.news_items (published_at desc);
create index on public.clubs (created_at desc);
create index on public.announcements (club_id, published_at desc);
