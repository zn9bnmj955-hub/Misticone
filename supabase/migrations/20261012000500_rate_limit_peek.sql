-- Read-only check of a rate limit (no increment): used to count only failed
-- PIN attempts, so successful logins never lock anybody out.
create or replace function public.rate_limit_exceeded(p_key text, p_max int, p_window_seconds int)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select count >= p_max from public.rate_limits
    where key = p_key and window_start >= now() - make_interval(secs => p_window_seconds)
  ), false)
$$;
revoke execute on function public.rate_limit_exceeded(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_exceeded(text, int, int) to service_role;
