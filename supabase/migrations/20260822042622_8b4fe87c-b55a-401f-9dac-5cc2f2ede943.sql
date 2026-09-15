
ALTER TABLE public.game_invites ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 minutes');

DROP POLICY IF EXISTS "Players see their games" ON public.games;
CREATE POLICY "Players see their games" ON public.games
FOR SELECT TO authenticated
USING (
  auth.uid() = host_id
  OR public.is_game_player(id, auth.uid())
  OR EXISTS (SELECT 1 FROM public.game_invites gi WHERE gi.game_id = games.id AND gi.invitee_id = auth.uid())
);

DROP POLICY IF EXISTS "See players of my games" ON public.game_players;
CREATE POLICY "See players of my games" ON public.game_players
FOR SELECT TO authenticated
USING (
  public.is_game_player(game_id, auth.uid())
  OR EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_players.game_id AND g.host_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.game_invites gi WHERE gi.game_id = game_players.game_id AND gi.invitee_id = auth.uid())
);
