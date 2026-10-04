-- groups
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- group_members
CREATE TABLE public.group_members (
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.group_members TO authenticated;
GRANT UPDATE (nickname, is_admin) ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_group_members_user ON public.group_members (user_id, group_id);

-- group_messages
CREATE TABLE public.group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('image','video','audio')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_group_messages_group_created ON public.group_messages (group_id, created_at DESC);

-- Membership checks use SECURITY DEFINER to avoid recursive RLS evaluation.
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = _group_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_admin(_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = _group_id AND user_id = auth.uid() AND is_admin
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_creator(_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.groups
    WHERE id = _group_id AND created_by = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_group_member(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_creator(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_group_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_creator(UUID) TO authenticated;

-- New groups automatically include their creator as an admin.
CREATE OR REPLACE FUNCTION public.add_group_creator_as_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.group_members (group_id, user_id, is_admin)
  VALUES (NEW.id, NEW.created_by, true);
  RETURN NEW;
END;
$$;

CREATE TRIGGER groups_add_creator_as_admin
  AFTER INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.add_group_creator_as_admin();

-- groups policies
CREATE POLICY "Group members see groups" ON public.groups
  FOR SELECT TO authenticated
  USING (public.is_group_member(id));

CREATE POLICY "Users create own groups" ON public.groups
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Group admins update groups" ON public.groups
  FOR UPDATE TO authenticated
  USING (public.is_group_admin(id))
  WITH CHECK (public.is_group_admin(id));

CREATE POLICY "Group admins delete groups" ON public.groups
  FOR DELETE TO authenticated
  USING (public.is_group_admin(id));

-- group_members policies
CREATE POLICY "Group members see membership" ON public.group_members
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "Admins add group members" ON public.group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (NOT is_admin AND public.is_group_admin(group_id))
    OR (
      is_admin
      AND user_id = auth.uid()
      AND public.is_group_creator(group_id)
    )
  );

CREATE POLICY "Members update own nickname" ON public.group_members
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND NOT is_admin
    AND public.is_group_member(group_id)
  )
  WITH CHECK (
    auth.uid() = user_id
    AND NOT is_admin
    AND public.is_group_member(group_id)
  );

CREATE POLICY "Admins update group membership" ON public.group_members
  FOR UPDATE TO authenticated
  USING (public.is_group_admin(group_id))
  WITH CHECK (public.is_group_admin(group_id));

CREATE POLICY "Members leave or admins remove members" ON public.group_members
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_group_admin(group_id)
  );

-- group_messages policies
CREATE POLICY "Group members see messages" ON public.group_messages
  FOR SELECT TO authenticated
  USING (public.is_group_member(group_id));

CREATE POLICY "Group members send messages as self" ON public.group_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_group_member(group_id)
  );

CREATE POLICY "Senders or admins delete group messages" ON public.group_messages
  FOR DELETE TO authenticated
  USING (
    auth.uid() = sender_id
    OR public.is_group_admin(group_id)
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
