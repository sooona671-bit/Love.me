CREATE OR REPLACE FUNCTION public.accept_game_invite(_invite_id UUID)
RETURNS TABLE(game_id UUID, kind TEXT, seat SMALLINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite public.game_invites%ROWTYPE;
  _game public.games%ROWTYPE;
  _seat SMALLINT;
  _player_count INTEGER;
  _pieces JSONB;
BEGIN
  SELECT * INTO _invite
  FROM public.game_invites
  WHERE id = _invite_id
  FOR UPDATE;

  IF NOT FOUND OR _invite.invitee_id <> auth.uid() THEN
    RAISE EXCEPTION 'Invite not found' USING ERRCODE = 'P0002';
  END IF;

  IF _invite.status <> 'pending' OR _invite.expires_at <= now() THEN
    RAISE EXCEPTION 'Invite is no longer available' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO _game
  FROM public.games
  WHERE id = _invite.game_id
  FOR UPDATE;

  IF NOT FOUND OR _game.status <> 'waiting' THEN
    RAISE EXCEPTION 'Game is no longer available' USING ERRCODE = 'P0001';
  END IF;

  SELECT s INTO _seat
  FROM generate_series(0, CASE WHEN _game.kind = 'tictactoe' THEN 1 ELSE 3 END) AS s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.game_players gp
    WHERE gp.game_id = _game.id AND gp.seat = s
  )
  ORDER BY s
  LIMIT 1;

  IF _seat IS NULL THEN
    RAISE EXCEPTION 'Game is full' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.game_players (game_id, user_id, seat, color)
  VALUES (
    _game.id,
    auth.uid(),
    _seat,
    (ARRAY['coral', 'lavender', 'dusty-rose', 'muted-gold'])[_seat + 1]
  )
  ON CONFLICT (game_id, user_id) DO UPDATE SET
    seat = EXCLUDED.seat,
    color = EXCLUDED.color;

  UPDATE public.game_invites
  SET status = 'accepted'
  WHERE id = _invite.id;

  SELECT count(*)::INTEGER INTO _player_count
  FROM public.game_players gp
  WHERE gp.game_id = _game.id;

  IF _player_count < 2 THEN
    RAISE EXCEPTION 'Game needs two players' USING ERRCODE = 'P0001';
  END IF;

  IF _game.kind = 'ludo' THEN
    SELECT jsonb_agg(to_jsonb(ARRAY[-1, -1, -1, -1]) ORDER BY n)
    INTO _pieces
    FROM generate_series(1, LEAST(_player_count, 4)) AS n;

    UPDATE public.games
    SET status = 'active', winner_id = NULL,
        state = jsonb_build_object(
          'pieces', _pieces,
          'turn', 0,
          'dice', NULL,
          'rolled', false,
          'sixStreak', 0,
          'winner', NULL,
          'seats', LEAST(_player_count, 4),
          'log', jsonb_build_array('Game on 🎲')
        )
    WHERE id = _game.id;
  ELSE
    UPDATE public.games
    SET status = 'active', winner_id = NULL,
        state = jsonb_build_object(
          'board', jsonb_build_array(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
          'turn', 0,
          'winner', NULL,
          'winLine', NULL
        )
    WHERE id = _game.id;
  END IF;

  UPDATE public.game_invites
  SET status = 'declined'
  WHERE public.game_invites.game_id = _game.id
    AND id <> _invite.id
    AND status = 'pending';

  RETURN QUERY SELECT _game.id, _game.kind, _seat;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_game_invite(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_game_invite(UUID) TO authenticated;