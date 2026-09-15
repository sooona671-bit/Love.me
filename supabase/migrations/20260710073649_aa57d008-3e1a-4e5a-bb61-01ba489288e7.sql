
-- direct_messages
CREATE TABLE public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT,
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('image','video','audio')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dm_pair ON public.direct_messages (
  LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at DESC
);
CREATE INDEX idx_dm_recipient ON public.direct_messages (recipient_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_messages TO authenticated;
GRANT ALL ON public.direct_messages TO service_role;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "DM read own" ON public.direct_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);
CREATE POLICY "DM send" ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id AND sender_id <> recipient_id);
CREATE POLICY "DM delete own" ON public.direct_messages
  FOR DELETE TO authenticated
  USING (auth.uid() = sender_id);

-- direct_message_reads
CREATE TABLE public.direct_message_reads (
  message_id UUID NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.direct_message_reads TO authenticated;
GRANT ALL ON public.direct_message_reads TO service_role;
ALTER TABLE public.direct_message_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "DM read: read receipts visible to pair" ON public.direct_message_reads
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.direct_messages d
    WHERE d.id = direct_message_reads.message_id
      AND (d.sender_id = auth.uid() OR d.recipient_id = auth.uid())
  ));
CREATE POLICY "DM read: mark own" ON public.direct_message_reads
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.direct_messages d
    WHERE d.id = direct_message_reads.message_id
      AND d.recipient_id = auth.uid()
  ));

-- direct_message_reactions
CREATE TABLE public.direct_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.direct_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
GRANT SELECT, INSERT, DELETE ON public.direct_message_reactions TO authenticated;
GRANT ALL ON public.direct_message_reactions TO service_role;
ALTER TABLE public.direct_message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "DM reactions: pair reads" ON public.direct_message_reactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.direct_messages d
    WHERE d.id = direct_message_reactions.message_id
      AND (d.sender_id = auth.uid() OR d.recipient_id = auth.uid())
  ));
CREATE POLICY "DM reactions: add own" ON public.direct_message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.direct_messages d
    WHERE d.id = direct_message_reactions.message_id
      AND (d.sender_id = auth.uid() OR d.recipient_id = auth.uid())
  ));
CREATE POLICY "DM reactions: remove own" ON public.direct_message_reactions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- direct_location_shares (per pair, 1h TTL)
CREATE TABLE public.direct_location_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  place_label TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, recipient_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.direct_location_shares TO authenticated;
GRANT ALL ON public.direct_location_shares TO service_role;
ALTER TABLE public.direct_location_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "DLS: pair reads" ON public.direct_location_shares
  FOR SELECT TO authenticated
  USING (auth.uid() = owner_id OR auth.uid() = recipient_id);
CREATE POLICY "DLS: owner writes" ON public.direct_location_shares
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND owner_id <> recipient_id);
CREATE POLICY "DLS: owner updates" ON public.direct_location_shares
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "DLS: owner deletes" ON public.direct_location_shares
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_message_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_location_shares;
