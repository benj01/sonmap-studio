-- Enable RLS for storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to upload files to their project folders
CREATE POLICY "Users can upload files to their project folders" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-files' AND
  (storage.foldername(name))[2] IN (
    SELECT id::text
    FROM projects
    WHERE id::text = (storage.foldername(name))[2]
    AND owner_id = auth.uid()
  )
);

-- Create policy to allow authenticated users to read files from their project folders
CREATE POLICY "Users can read files from their project folders" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'project-files' AND
  (storage.foldername(name))[2] IN (
    SELECT id::text
    FROM projects
    WHERE id::text = (storage.foldername(name))[2]
    AND owner_id = auth.uid()
  )
);

-- Create policy to allow authenticated users to delete files from their project folders
CREATE POLICY "Users can delete files from their project folders" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'project-files' AND
  (storage.foldername(name))[2] IN (
    SELECT id::text
    FROM projects
    WHERE id::text = (storage.foldername(name))[2]
    AND owner_id = auth.uid()
  )
); 