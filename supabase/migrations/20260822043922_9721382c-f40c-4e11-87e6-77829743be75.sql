
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_players TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_invites TO authenticated;
GRANT ALL ON public.games TO service_role;
GRANT ALL ON public.game_players TO service_role;
GRANT ALL ON public.game_invites TO service_role;
