-- Add DELETE policy for clipbeam-items storage bucket
-- This allows cleanup functions and other operations to delete files from storage.
DROP POLICY IF EXISTS "Allow deletes from clipbeam-items" ON storage.objects;

CREATE POLICY "Allow deletes from clipbeam-items"
  ON storage.objects FOR DELETE TO public
  USING (bucket_id = 'clipbeam-items');
