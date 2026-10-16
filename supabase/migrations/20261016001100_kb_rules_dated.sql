-- OrgaSport — lot 2 (A2): dated knowledge base.
-- A document is either a help sheet about the site ("help") or a summary of an
-- official rulebook ("rules"). A rulebook summary carries the date of the
-- version it summarises ("en vigueur au …") and the date it was last reviewed:
-- the admin is warned when a rulebook has not been reviewed for 12 months.

alter table public.kb_documents
  add column kind text not null default 'help' check (kind in ('help', 'rules')),
  add column version_date date,
  add column reviewed_at date;

-- A rulebook summary is always dated (help sheets may be).
alter table public.kb_documents
  add constraint kb_documents_rules_dated check (kind <> 'rules' or (version_date is not null and reviewed_at is not null));

-- kb_search now also returns the kind and the dates, so the assistant can cite
-- « règlement en vigueur au … ». The return type changes: drop and recreate.
drop function public.kb_search(text, text, int);
create function public.kb_search(p_query text, p_sport text default null, p_limit int default 5)
returns table (title text, sport_slug text, source_url text, content text, rank real, kind text, version_date date, reviewed_at date)
language sql stable security invoker set search_path = '' as $$
  with q as (
    select nullif(replace(plainto_tsquery('french', p_query)::text, ' & ', ' | '), '')::tsquery as query
  )
  select d.title, d.sport_slug, d.source_url, c.content, ts_rank(c.tsv, q.query) as rank, d.kind, d.version_date, d.reviewed_at
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
revoke execute on function public.kb_search(text, text, int) from public;
grant execute on function public.kb_search(text, text, int) to anon, authenticated, service_role;
