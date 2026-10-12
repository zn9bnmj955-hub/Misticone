-- OrgaSport — phase 6: AI assistant (quotas, spending cap, knowledge base).

-- Usage counters, one row per day and per account or device. Written by the
-- server only (service role), after each answer.
create or replace function public.ai_usage_add(
  p_user uuid, p_device text, p_input bigint, p_output bigint, p_cost bigint
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is not null then
    insert into public.ai_usage (day, user_id, questions, input_tokens, output_tokens, cost_micro_eur)
    values (current_date, p_user, 1, p_input, p_output, p_cost)
    on conflict (day, user_id) where user_id is not null do update set
      questions = public.ai_usage.questions + 1,
      input_tokens = public.ai_usage.input_tokens + excluded.input_tokens,
      output_tokens = public.ai_usage.output_tokens + excluded.output_tokens,
      cost_micro_eur = public.ai_usage.cost_micro_eur + excluded.cost_micro_eur;
  else
    insert into public.ai_usage (day, device_hash, questions, input_tokens, output_tokens, cost_micro_eur)
    values (current_date, p_device, 1, p_input, p_output, p_cost)
    on conflict (day, device_hash) where device_hash is not null do update set
      questions = public.ai_usage.questions + 1,
      input_tokens = public.ai_usage.input_tokens + excluded.input_tokens,
      output_tokens = public.ai_usage.output_tokens + excluded.output_tokens,
      cost_micro_eur = public.ai_usage.cost_micro_eur + excluded.cost_micro_eur;
  end if;
end $$;

-- Spending of the current month (all accounts and devices), for the global cap.
create or replace function public.ai_month_cost_micro()
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum(cost_micro_eur), 0)::bigint from public.ai_usage
  where day >= date_trunc('month', current_date)::date
$$;

revoke execute on function public.ai_usage_add(uuid, text, bigint, bigint, bigint) from public, anon, authenticated;
revoke execute on function public.ai_month_cost_micro() from public, anon, authenticated;
grant execute on function public.ai_usage_add(uuid, text, bigint, bigint, bigint) to service_role;
grant execute on function public.ai_month_cost_micro() to service_role;

-- Knowledge base: documents are cut into paragraphs (chunks) automatically,
-- so the admin only edits the document. French full-text search.
create or replace function public.kb_rechunk()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  para text;
  pos int := 0;
begin
  delete from public.kb_chunks where document_id = new.id;
  for para in
    select trim(p) from regexp_split_to_table(new.body, E'\\n\\s*\\n') as p where length(trim(p)) > 0
  loop
    pos := pos + 1;
    insert into public.kb_chunks (document_id, position, content)
    values (new.id, pos, new.title || ' — ' || left(para, 4000));
  end loop;
  return new;
end $$;
create trigger kb_documents_rechunk after insert or update of title, body on public.kb_documents
  for each row execute function public.kb_rechunk();
revoke execute on function public.kb_rechunk() from public, anon, authenticated;

-- Best paragraphs for a question (published documents only, via RLS). A
-- question is natural language: any meaningful word may match (OR), the
-- ranking puts paragraphs matching several words first.
create or replace function public.kb_search(p_query text, p_sport text default null, p_limit int default 5)
returns table (title text, sport_slug text, source_url text, content text, rank real)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select nullif(replace(plainto_tsquery('french', p_query)::text, ' & ', ' | '), '')::tsquery as query
  )
  select d.title, d.sport_slug, d.source_url, c.content, ts_rank(c.tsv, q.query) as rank
  from public.kb_chunks c
  join public.kb_documents d on d.id = c.document_id
  cross join q
  where d.published
    and q.query is not null
    and c.tsv @@ q.query
    and (p_sport is null or d.sport_slug is null or d.sport_slug = p_sport)
  order by rank desc
  limit least(greatest(p_limit, 1), 10)
$$;
grant execute on function public.kb_search(text, text, int) to anon, authenticated, service_role;
