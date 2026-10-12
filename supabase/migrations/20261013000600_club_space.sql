-- OrgaSport — phase 3: club space, tournament creation form, payment, publication.
--
-- Payment rule: a tournament leaves "draft" only through publish_tournament(),
-- callable by the service role only (Stripe webhook, free promo code, admin).
-- What gets published is the form snapshot frozen on the payment row when the
-- checkout started: what the club paid for is exactly what goes online.

-- ---------------------------------------------------------------------------
-- Tournament drafts
-- ---------------------------------------------------------------------------
alter table public.tournaments
  add column draft_form jsonb not null default '{}',
  add column draft_step text,
  add column pricing_plan_id uuid references public.pricing_plans (id);

-- ---------------------------------------------------------------------------
-- Promo codes (our own table: works with any payment provider)
-- ---------------------------------------------------------------------------
create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description text,
  percent_off int check (percent_off between 1 and 100),
  amount_off_cents int check (amount_off_cents > 0),
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  redemptions int not null default 0,
  valid_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((percent_off is null) <> (amount_off_cents is null))
);
create trigger set_updated_at before update on public.promo_codes for each row execute function public.set_updated_at();
alter table public.promo_codes enable row level security;
-- Codes are checked by the server; only platform admins list or edit them.
create policy "admins manage promo codes" on public.promo_codes
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
create type public.payment_provider as enum ('stripe', 'simulation', 'free');

alter table public.payments
  add column provider public.payment_provider not null default 'stripe',
  add column discount_cents int not null default 0 check (discount_cents >= 0),
  add column promo_code_id uuid references public.promo_codes (id),
  add column form_snapshot jsonb not null default '{}',
  add column checkout_url text,
  add column customer_email text,
  add column expires_at timestamptz,
  add column created_by uuid references auth.users (id) on delete set null,
  add column updated_at timestamptz not null default now();
create trigger set_updated_at before update on public.payments for each row execute function public.set_updated_at();
create index on public.payments (tournament_id, status);
create index on public.payments (club_id, created_at desc);
-- At most one checkout in progress per tournament.
create unique index payments_one_pending_per_tournament on public.payments (tournament_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Club invitations (a link sent by email; accepted by the invited address)
-- ---------------------------------------------------------------------------
create table public.club_invitations (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.club_role not null default 'member' check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);
create index on public.club_invitations (club_id);
alter table public.club_invitations enable row level security;
-- The token hash is never readable through the API.
revoke select on public.club_invitations from anon, authenticated;
grant select (id, club_id, email, role, invited_by, created_at, expires_at, accepted_at, accepted_by)
  on public.club_invitations to authenticated;
create policy "club admins see invitations" on public.club_invitations
  for select using (public.is_club_admin(club_id));
create policy "club admins revoke invitations" on public.club_invitations
  for delete using (public.is_club_admin(club_id));
-- Inserts and acceptance go through server code (service role).

-- ---------------------------------------------------------------------------
-- Co-organizers invited by email get access once that address has an account
-- with a confirmed email. We never trust an unverified address.
-- ---------------------------------------------------------------------------
create or replace function public.link_staff_by_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and new.email_confirmed_at is not null then
    update public.tournament_staff
      set user_id = new.id
      where user_id is null and email is not null and lower(email) = lower(new.email);
  end if;
  return new;
end $$;
create trigger on_auth_user_confirmed after insert or update of email_confirmed_at on auth.users
  for each row execute function public.link_staff_by_email();

-- ---------------------------------------------------------------------------
-- Tournament media (posters, rules PDF). Public bucket; uploads go through
-- server code after a membership check.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tournament-media', 'tournament-media', true, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "tournament media is public" on storage.objects
  for select using (bucket_id = 'tournament-media');

-- ---------------------------------------------------------------------------
-- Publication (atomic, idempotent, service role only)
-- p_fields: tournament columns computed by the server from the form snapshot.
-- p_venues: [{label, position, reserved}]
-- p_staff:  [{role, label, user_id?, email?, phone?, pin?}] — PINs arrive in
--           clear text and are hashed here; they are never stored in clear.
-- Returns 'published', or 'already_published' when called again.
-- ---------------------------------------------------------------------------
create or replace function public.publish_tournament(
  p_payment uuid, p_fields jsonb, p_venues jsonb, p_staff jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments%rowtype;
  t public.tournaments%rowtype;
  v jsonb;
  s jsonb;
begin
  select * into pay from public.payments where id = p_payment for update;
  if not found then raise exception 'payment_not_found'; end if;
  select * into t from public.tournaments where id = pay.tournament_id for update;

  if pay.status = 'paid' and t.status <> 'draft' then
    return 'already_published';
  end if;

  update public.payments set status = 'paid', paid_at = coalesce(paid_at, now()) where id = pay.id;
  if pay.promo_code_id is not null and pay.status <> 'paid' then
    update public.promo_codes set redemptions = redemptions + 1 where id = pay.promo_code_id;
  end if;
  -- Any other checkout left open for this tournament is now pointless.
  update public.payments set status = 'expired'
    where tournament_id = pay.tournament_id and id <> pay.id and status = 'pending';

  if t.status <> 'draft' then
    return 'already_published';
  end if;

  update public.tournaments set
    name = coalesce(p_fields ->> 'name', name),
    sport_slug = coalesce(p_fields ->> 'sport_slug', sport_slug),
    starts_at = (p_fields ->> 'starts_at')::timestamptz,
    registration_closes_at = (p_fields ->> 'registration_closes_at')::timestamptz,
    checkin_closes_at = (p_fields ->> 'checkin_closes_at')::timestamptz,
    estimated_end_at = (p_fields ->> 'estimated_end_at')::timestamptz,
    address = p_fields ->> 'address',
    postcode = p_fields ->> 'postcode',
    city = p_fields ->> 'city',
    lat = (p_fields ->> 'lat')::double precision,
    lng = (p_fields ->> 'lng')::double precision,
    parking = p_fields ->> 'parking',
    food = p_fields ->> 'food',
    poster_path = p_fields ->> 'poster_path',
    rules_text = p_fields ->> 'rules_text',
    rules_pdf_path = p_fields ->> 'rules_pdf_path',
    team_format = p_fields ->> 'team_format',
    category = coalesce(p_fields ->> 'category', 'all'),
    eligibility = coalesce((p_fields ->> 'eligibility')::public.eligibility, 'open'),
    max_teams = (p_fields ->> 'max_teams')::int,
    waitlist_enabled = coalesce((p_fields ->> 'waitlist_enabled')::boolean, true),
    registration_mode = coalesce((p_fields ->> 'registration_mode')::public.registration_mode, 'both'),
    name_display = coalesce((p_fields ->> 'name_display')::public.name_display, 'initials'),
    fee_cents = coalesce((p_fields ->> 'fee_cents')::int, 0),
    fee_per = coalesce(p_fields ->> 'fee_per', 'team'),
    prize_text = p_fields ->> 'prize_text',
    welcome_message = p_fields ->> 'welcome_message',
    contact_name = p_fields ->> 'contact_name',
    contact_phone = p_fields ->> 'contact_phone',
    config = coalesce(p_fields -> 'config', '{}'::jsonb),
    pricing_plan_id = pay.pricing_plan_id,
    status = 'published',
    published_at = now()
  where id = t.id;

  delete from public.venues where tournament_id = t.id;
  for v in select * from jsonb_array_elements(coalesce(p_venues, '[]'::jsonb)) loop
    insert into public.venues (tournament_id, label, position, reserved_for_finals)
    values (t.id, v ->> 'label', (v ->> 'position')::int, coalesce((v ->> 'reserved')::boolean, false));
  end loop;

  for s in select * from jsonb_array_elements(coalesce(p_staff, '[]'::jsonb)) loop
    insert into public.tournament_staff (tournament_id, user_id, role, label, email, phone, pin_hash)
    values (
      t.id,
      coalesce(
        nullif(s ->> 'user_id', '')::uuid,
        (select u.id from auth.users u
          where s ->> 'email' is not null and lower(u.email) = lower(s ->> 'email')
            and u.email_confirmed_at is not null
          limit 1)
      ),
      (s ->> 'role')::public.staff_role,
      s ->> 'label',
      nullif(s ->> 'email', ''),
      nullif(s ->> 'phone', ''),
      case when s ->> 'pin' is not null then extensions.crypt(s ->> 'pin', extensions.gen_salt('bf')) end
    );
  end loop;

  return 'published';
end $$;

revoke execute on function public.publish_tournament(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.publish_tournament(uuid, jsonb, jsonb, jsonb) to service_role;
revoke execute on function public.link_staff_by_email() from public, anon, authenticated;
