
CREATE POLICY "Auth reads family media" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'family-media');
CREATE POLICY "Auth uploads to family media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'family-media' AND owner = auth.uid());
CREATE POLICY "Owner deletes own media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'family-media' AND owner = auth.uid());
