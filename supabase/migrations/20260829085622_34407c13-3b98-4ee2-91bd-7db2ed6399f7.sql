CREATE POLICY "Owner updates own media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'family-media' AND owner = auth.uid())
WITH CHECK (bucket_id = 'family-media' AND owner = auth.uid());