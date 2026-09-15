REVOKE ALL ON FUNCTION public.accept_game_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_game_invite(uuid) TO authenticated;