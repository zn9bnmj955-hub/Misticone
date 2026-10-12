-- Public bucket for club logos. Uploads go through server code (service
-- role) after checking club membership, so no client write policy is needed.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('club-logos', 'club-logos', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

create policy "club logos are public" on storage.objects
  for select using (bucket_id = 'club-logos');
