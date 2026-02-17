-- Ensure predictable policies for clipbeam-items bucket
drop policy if exists "Allow uploads to clipbeam-items" on storage.objects;
drop policy if exists "Public read access on clipbeam-items" on storage.objects;

create policy "Allow uploads to clipbeam-items"
  on storage.objects
  for insert
  to public
  with check (bucket_id = 'clipbeam-items');

create policy "Public read access on clipbeam-items"
  on storage.objects
  for select
  to public
  using (bucket_id = 'clipbeam-items');