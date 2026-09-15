
-- games
CREATE TABLE public.games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('ludo','tictactoe')),
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','finished','cancelled')),
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  winner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- game_players
CREATE TABLE public.game_players (
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat SMALLINT NOT NULL CHECK (seat BETWEEN 0 AND 3),
  color TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, user_id),
  UNIQUE (game_id, seat)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_players TO authenticated;
GRANT ALL ON public.game_players TO service_role;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;

-- game_invites
CREATE TABLE public.game_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '2 minutes'),
  UNIQUE (game_id, invitee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_invites TO authenticated;
GRANT ALL ON public.game_invites TO service_role;
ALTER TABLE public.game_invites ENABLE ROW LEVEL SECURITY;

-- helper: is user a player in the game?
CREATE OR REPLACE FUNCTION public.is_game_player(_game_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.game_players WHERE game_id = _game_id AND user_id = _user_id
  );
$$;

-- games policies
CREATE POLICY "Players see their games" ON public.games
  FOR SELECT TO authenticated
  USING (
    auth.uid() = host_id
    OR public.is_game_player(id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.game_invites gi WHERE gi.game_id = id AND gi.invitee_id = auth.uid())
  );

CREATE POLICY "Host creates games" ON public.games
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Players update game state" ON public.games
  FOR UPDATE TO authenticated
  USING (auth.uid() = host_id OR public.is_game_player(id, auth.uid()))
  WITH CHECK (auth.uid() = host_id OR public.is_game_player(id, auth.uid()));

CREATE POLICY "Host deletes game" ON public.games
  FOR DELETE TO authenticated
  USING (auth.uid() = host_id);

-- game_players policies
CREATE POLICY "See players of my games" ON public.game_players
  FOR SELECT TO authenticated
  USING (
    public.is_game_player(game_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND g.host_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.game_invites gi WHERE gi.game_id = game_id AND gi.invitee_id = auth.uid())
  );

CREATE POLICY "Join as self" ON public.game_players
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Leave own seat" ON public.game_players
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND g.host_id = auth.uid()));

-- game_invites policies
CREATE POLICY "Invitee or host sees invites" ON public.game_invites
  FOR SELECT TO authenticated
  USING (auth.uid() = invitee_id OR auth.uid() = inviter_id);

CREATE POLICY "Host sends invites" ON public.game_invites
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = inviter_id);

CREATE POLICY "Invitee or inviter updates invite" ON public.game_invites
  FOR UPDATE TO authenticated
  USING (auth.uid() = invitee_id OR auth.uid() = inviter_id)
  WITH CHECK (auth.uid() = invitee_id OR auth.uid() = inviter_id);

CREATE POLICY "Inviter deletes invite" ON public.game_invites
  FOR DELETE TO authenticated
  USING (auth.uid() = inviter_id);

-- updated_at trigger on games
CREATE TRIGGER games_set_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_invites;
