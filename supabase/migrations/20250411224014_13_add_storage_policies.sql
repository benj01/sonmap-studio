-- Policy to allow authenticated users to INSERT into storage.objects for 'project-files' bucket
-- This is a simplified version, Supabase defaults might be more complex
-- Ensure the owner is set correctly by the client library or trigger
CREATE POLICY "Allow authenticated inserts in project-files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-files'); -- Check that the insert is for the correct bucket

-- Policy to allow owners to SELECT their own objects in 'project-files' bucket
-- Needed for listing files, downloading, etc.
CREATE POLICY "Allow owner select in project-files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-files' AND owner = auth.uid());

-- Policy to allow owners to UPDATE their own objects (e.g., metadata)
CREATE POLICY "Allow owner update in project-files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'project-files' AND owner = auth.uid());

-- Policy to allow owners to DELETE their own objects
CREATE POLICY "Allow owner delete in project-files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-files' AND owner = auth.uid());

-- IMPORTANT: Enable RLS on the table if it's not already enabled
-- (Though if it were disabled, you'd get a different error)
-- You can check with: SELECT relrowsecurity FROM pg_class WHERE relname = 'objects' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'storage');
-- If false, run:
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;