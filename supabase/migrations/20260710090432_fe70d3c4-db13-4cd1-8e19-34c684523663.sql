
-- Allow any family member to edit/check-off/delete list items (shared family lists)
ALTER TABLE public.checklist_items DROP CONSTRAINT IF EXISTS checklist_items_category_check;
ALTER TABLE public.checklist_items ADD CONSTRAINT checklist_items_category_check CHECK (category IN ('todo','grocery','shopping'));

DROP POLICY IF EXISTS "Users update own list items" ON public.checklist_items;
DROP POLICY IF EXISTS "Users delete own list items" ON public.checklist_items;

CREATE POLICY "Family can update list items" ON public.checklist_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Family can delete list items" ON public.checklist_items FOR DELETE TO authenticated USING (true);
