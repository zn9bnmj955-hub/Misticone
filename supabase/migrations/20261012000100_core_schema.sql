-- OrgaSport — core schema (phase 1)
-- Every table has Row Level Security enabled. Personal data (license numbers,
-- phones, emails) lives in separate *_private tables or in tables that the
-- public never reads directly: public tournament pages are rendered by the
-- server, which applies the organizer's display rules (full names / initials).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.tournament_status as enum (
  'draft', 'published', 'registration_closed', 'check_in', 'live', 'finished', 'archived'
);
create type public.club_kind as enum (
  'federated_club', 'association', 'festival_committee', 'town_hall', 'company', 'other'
);
create type public.club_role as enum ('owner', 'admin', 'member');
create type public.staff_role as enum ('organizer', 'co_organizer', 'referee');
create type public.team_status as enum ('registered', 'waitlist', 'checked_in', 'forfeit', 'withdrawn');
create type public.bracket_kind as enum ('main', 'consolation');
create type public.round_status as enum ('pending', 'drawn', 'live', 'finished');
create type public.match_status as enum (
  'waiting_venue', 'ready', 'playing', 'score_submitted', 'disputed', 'done', 'forfeit', 'bye'
);
create type public.eligibility as enum ('open', 'licensed', 'mixed');
create type public.registration_mode as enum ('online', 'onsite', 'both');
create type public.name_display as enum ('full', 'initials');
create type public.registration_source as enum ('online', 'onsite', 'organizer');
create type public.player_level as enum ('leisure', 'competition');
create type public.notification_channel as enum ('push', 'email', 'sms');
create type public.notification_status as enum ('queued', 'sent', 'failed', 'skipped');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded', 'expired');
create type public.score_submission_status as enum ('pending', 'confirmed', 'disputed', 'superseded');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Great-circle distance in km (no PostGIS needed for "near me" queries).
create or replace function public.distance_km(lat1 double precision, lng1 double precision,
                                              lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- ---------------------------------------------------------------------------
-- Platform
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

create table public.legal_pages (
  slug text primary key,
  title text not null,
  body text not null default '',
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sports (configuration, validated by packages/sports)
-- ---------------------------------------------------------------------------
create table public.sports (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  config jsonb not null,
  enabled boolean not null default true,
  sort_order int not null default 100,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 120),
  kind public.club_kind not null default 'association',
  sports text[] not null default '{}',
  federation text,
  affiliation_number text,
  address text,
  postcode text,
  city text,
  lat double precision,
  lng double precision,
  default_venue_count int check (default_venue_count is null or default_venue_count between 1 and 500),
  contact_name text,
  contact_email text,
  contact_phone text,
  logo_path text,
  description text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  sports text[] not null default '{}',
  level public.player_level,
  is_licensed boolean,
  city text,
  postcode text,
  lat double precision,
  lng double precision,
  search_radius_km int not null default 30 check (search_radius_km between 1 and 500),
  feed_prefs jsonb not null default '{"nearby": true, "results": true, "news": true, "clubs": true}',
  notifications_opt_in boolean not null default false,
  locale text not null default 'fr',
  -- Profile switcher: null = player profile, otherwise the club being managed.
  active_club_id uuid references public.clubs (id) on delete set null,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  license_number text,
  phone text,
  updated_at timestamptz not null default now()
);

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.club_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index on public.club_members (user_id);

create or replace function public.club_role_of(p_club uuid)
returns public.club_role language sql stable security definer set search_path = '' as $$
  select role from public.club_members where club_id = p_club and user_id = auth.uid()
$$;

create or replace function public.is_club_admin(p_club uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.club_members
    where club_id = p_club and user_id = auth.uid() and role in ('owner', 'admin')
  )
$$;

create or replace function public.is_club_member(p_club uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.club_members where club_id = p_club and user_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------------
-- Tournaments
-- ---------------------------------------------------------------------------
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete restrict,
  sport_slug text not null references public.sports (slug),
  short_code text unique check (short_code ~ '^[2-9A-HJKMNP-Z]{4,6}$'),
  name text not null check (char_length(name) between 3 and 140),
  status public.tournament_status not null default 'draft',
  starts_at timestamptz,
  registration_closes_at timestamptz,
  checkin_closes_at timestamptz,
  estimated_end_at timestamptz,
  address text,
  postcode text,
  city text,
  lat double precision,
  lng double precision,
  parking text,
  food text,
  poster_path text,
  rules_text text,
  rules_pdf_path text,
  team_format text,
  category text not null default 'all',
  eligibility public.eligibility not null default 'open',
  max_teams int check (max_teams is null or max_teams between 2 and 1024),
  waitlist_enabled boolean not null default true,
  registration_mode public.registration_mode not null default 'both',
  name_display public.name_display not null default 'initials',
  fee_cents int not null default 0 check (fee_cents >= 0),
  fee_per text not null default 'team' check (fee_per in ('team', 'player')),
  prize_text text,
  welcome_message text,
  contact_name text,
  contact_phone text,
  -- Draw, scoring and communication settings from the creation form.
  config jsonb not null default '{}',
  draw_seed text,
  created_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tournaments (status, starts_at);
create index on public.tournaments (club_id);
create index on public.tournaments (sport_slug);

-- Short code assigned by the database, retried on collision.
create or replace function public.generate_short_code(len int default 4)
returns text language plpgsql volatile as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..len loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.tournaments where short_code = code);
  end loop;
  return code;
end $$;

create or replace function public.tournaments_before_write()
returns trigger language plpgsql as $$
begin
  if new.short_code is null then
    new.short_code := public.generate_short_code();
  end if;
  -- Leaving "draft" is only allowed to trusted server code (Stripe webhook,
  -- seed, admin). A client can never publish without a confirmed payment.
  if tg_op = 'UPDATE' and old.status = 'draft' and new.status <> 'draft'
     and coalesce(auth.role(), 'service_role') not in ('service_role')
     and not public.is_platform_admin() then
    raise exception 'A tournament is published only after payment confirmation';
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft'
     and coalesce(auth.role(), 'service_role') not in ('service_role')
     and not public.is_platform_admin() then
    raise exception 'New tournaments start as drafts';
  end if;
  return new;
end $$;
create trigger tournaments_before_write before insert or update on public.tournaments
  for each row execute function public.tournaments_before_write();

create table public.tournament_staff (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  role public.staff_role not null,
  label text not null,
  email text,
  phone text,
  pin_hash text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (user_id is not null or pin_hash is not null or email is not null)
);
create index on public.tournament_staff (tournament_id);
create index on public.tournament_staff (user_id);

create or replace function public.can_manage_tournament(p_tournament uuid)
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
    )
$$;

create or replace function public.is_tournament_public(p_tournament uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tournaments where id = p_tournament and status <> 'draft')
$$;

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  label text not null,
  position int not null,
  reserved_for_finals boolean not null default false,
  available boolean not null default true,
  unique (tournament_id, position)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  number int not null check (number > 0),
  name text,
  club_name text,
  status public.team_status not null default 'registered',
  seed int,
  bracket public.bracket_kind not null default 'main',
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tournament_id, number)
);
create index on public.teams (tournament_id, status);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  first_name text not null,
  last_name text not null,
  category text,
  position int not null default 1,
  is_substitute boolean not null default false
);
create index on public.players (team_id);
create index on public.players (user_id);

create table public.players_private (
  player_id uuid primary key references public.players (id) on delete cascade,
  license_number text
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  source public.registration_source not null,
  user_id uuid references auth.users (id) on delete set null,
  captain_name text,
  captain_phone text,
  captain_email text,
  -- Hash of a random token stored on the registering device, so the public
  -- page can highlight "your team" without an account.
  device_token_hash text,
  accepted_rules_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.registrations (tournament_id);
create index on public.registrations (user_id);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  bracket public.bracket_kind not null default 'main',
  number int not null check (number > 0),
  phase text not null default 'main',
  status public.round_status not null default 'pending',
  seed text,
  drawn_at timestamptz,
  unique (tournament_id, bracket, phase, number)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round_id uuid not null references public.rounds (id) on delete cascade,
  position int not null,
  team_a_id uuid references public.teams (id) on delete set null,
  team_b_id uuid references public.teams (id) on delete set null,
  venue_id uuid references public.venues (id) on delete set null,
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  score_a int check (score_a is null or score_a >= 0),
  score_b int check (score_b is null or score_b >= 0),
  winner_team_id uuid references public.teams (id) on delete set null,
  status public.match_status not null default 'waiting_venue',
  version int not null default 1,
  updated_at timestamptz not null default now(),
  unique (round_id, position)
);
create index on public.matches (tournament_id, status);
create index on public.matches (team_a_id);
create index on public.matches (team_b_id);

create table public.score_submissions (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  submitted_by_user uuid references auth.users (id) on delete set null,
  submitted_by_team uuid references public.teams (id) on delete set null,
  score_a int not null check (score_a >= 0),
  score_b int not null check (score_b >= 0),
  status public.score_submission_status not null default 'pending',
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Every organizer action, with what is needed to undo it.
create table public.tournament_actions (
  id bigint generated always as identity primary key,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_staff_id uuid references public.tournament_staff (id) on delete set null,
  type text not null,
  payload jsonb not null default '{}',
  inverse jsonb,
  client_op_id uuid unique,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by_action bigint references public.tournament_actions (id)
);
create index on public.tournament_actions (tournament_id, created_at desc);

create table public.follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  club_id uuid references public.clubs (id) on delete cascade,
  tournament_id uuid references public.tournaments (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((club_id is null) <> (tournament_id is null)),
  unique (user_id, club_id),
  unique (user_id, tournament_id)
);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_id uuid references auth.users (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  tournament_id uuid references public.tournaments (id) on delete cascade,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  channel public.notification_channel not null,
  template text not null,
  payload jsonb not null default '{}',
  user_id uuid references auth.users (id) on delete cascade,
  push_subscription_id uuid references public.push_subscriptions (id) on delete cascade,
  email text,
  tournament_id uuid references public.tournaments (id) on delete cascade,
  status public.notification_status not null default 'queued',
  attempts int not null default 0,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index on public.notifications (status, scheduled_for);

-- ---------------------------------------------------------------------------
-- Payments (no card data ever stored here)
-- ---------------------------------------------------------------------------
create table public.pricing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  description text,
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'eur',
  sport_slug text references public.sports (slug),
  max_teams int,
  active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete restrict,
  club_id uuid not null references public.clubs (id) on delete restrict,
  pricing_plan_id uuid references public.pricing_plans (id),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  amount_cents int not null,
  currency text not null default 'eur',
  status public.payment_status not null default 'pending',
  promo_code text,
  receipt_url text,
  invoice_url text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Content: announcements, news (RSS, title + link only), knowledge base
-- ---------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  sport_slug text references public.sports (slug),
  title text not null check (char_length(title) between 3 and 140),
  body text check (body is null or char_length(body) <= 2000),
  link_url text,
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  feed_url text not null unique,
  site_url text,
  sport_slug text references public.sports (slug),
  enabled boolean not null default true,
  last_fetched_at timestamptz
);

create table public.news_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.news_sources (id) on delete cascade,
  title text not null,
  url text not null unique,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  sport_slug text references public.sports (slug),
  source_url text,
  body text not null,
  published boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.kb_documents (id) on delete cascade,
  position int not null,
  content text not null,
  tsv tsvector generated always as (to_tsvector('french', content)) stored
);
create index on public.kb_chunks using gin (tsv);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  day date not null default current_date,
  user_id uuid references auth.users (id) on delete cascade,
  device_hash text,
  questions int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_micro_eur bigint not null default 0,
  check (user_id is not null or device_hash is not null)
);
create unique index on public.ai_usage (day, user_id) where user_id is not null;
create unique index on public.ai_usage (day, device_hash) where device_hash is not null;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger set_updated_at before update on public.clubs for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.profiles_private for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tournaments for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.matches for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.sports for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.pricing_plans for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.app_settings for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.legal_pages for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.kb_documents for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Account bootstrap
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), ''))
  on conflict (id) do nothing;
  insert into public.profiles_private (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- The creator of a club becomes its owner.
create or replace function public.handle_new_club()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.created_by is not null then
    insert into public.club_members (club_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger on_club_created after insert on public.clubs
  for each row execute function public.handle_new_club();
