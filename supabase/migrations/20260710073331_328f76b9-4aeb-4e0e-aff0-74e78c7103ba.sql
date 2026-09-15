
-- album_items: restrict delete to added_by
DROP POLICY IF EXISTS "Auth removes album items" ON public.album_items;
CREATE POLICY "Users delete own album items" ON public.album_items
  FOR DELETE TO authenticated USING (auth.uid() = added_by);

-- albums: restrict update to created_by
DROP POLICY IF EXISTS "Auth edits albums" ON public.albums;
CREATE POLICY "Users edit own albums" ON public.albums
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- checklist_items: restrict update/delete to created_by
DROP POLICY IF EXISTS "Auth updates list" ON public.checklist_items;
DROP POLICY IF EXISTS "Auth deletes list" ON public.checklist_items;
CREATE POLICY "Users update own list items" ON public.checklist_items
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users delete own list items" ON public.checklist_items
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- events: restrict update to created_by
DROP POLICY IF EXISTS "Auth edits events" ON public.events;
CREATE POLICY "Users edit own events" ON public.events
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- location_shares: only show rows that are opted-in, or the user's own row
DROP POLICY IF EXISTS "Auth reads locations" ON public.location_shares;
CREATE POLICY "Read enabled locations or own" ON public.location_shares
  FOR SELECT TO authenticated
  USING (enabled = true OR auth.uid() = user_id);

-- pinned_messages: restrict delete to pinned_by
DROP POLICY IF EXISTS "Auth unpins" ON public.pinned_messages;
CREATE POLICY "Users unpin own pins" ON public.pinned_messages
  FOR DELETE TO authenticated USING (auth.uid() = pinned_by);

-- poll_options: restrict insert to poll owner
DROP POLICY IF EXISTS "Auth adds options" ON public.poll_options;
CREATE POLICY "Poll owner adds options" ON public.poll_options
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_options.poll_id AND p.created_by = auth.uid()
  ));
