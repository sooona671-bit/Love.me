import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Dice } from "@/components/games/Dice";
import { LudoBoard } from "@/components/games/LudoBoard";
import { TicTacToeBoard } from "@/components/games/TicTacToeBoard";
import { Confetti } from "@/components/games/Confetti";
import { initialLudo, movePiece, rollDice, type LudoState } from "@/lib/ludo-engine";
import { initialTTT, playTTT, type TTTState } from "@/lib/tictactoe-engine";

export const Route = createFileRoute("/_authenticated/games/$gameId")({
  component: GameRoom,
});

type Game = { id: string; kind: "ludo" | "tictactoe"; host_id: string; status: string; state: unknown; winner_id: string | null };
type Player = { game_id: string; user_id: string; seat: number; color: string };
type Profile = { id: string; display_name: string; avatar_url: string | null };

function GameRoom() {
  const { user } = Route.useRouteContext();
  const { gameId } = Route.useParams();
  

  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [rolling, setRolling] = useState(false);
  const rollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWin, setShowWin] = useState(false);
  const announcedTurnRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const [{ data: g }, { data: ps }] = await Promise.all([
        supabase.from("games").select("*").eq("id", gameId).maybeSingle(),
        supabase.from("game_players").select("*").eq("game_id", gameId),
      ]);
      if (cancelled) return;
      setGame((g ?? null) as Game | null);
      setPlayers((ps ?? []) as Player[]);
    }

    void (async () => {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_url");
      if (cancelled) return;
      setProfiles((profs ?? []) as Profile[]);
      await refresh();
    })();

    const ch = supabase
      .channel(`game-${gameId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${gameId}` },
        () => void refresh())
      .subscribe();

    // Safety net for flaky networks: keep the room in sync even if realtime drops.
    const poll = setInterval(() => void refresh(), 1500);
    return () => { cancelled = true; clearInterval(poll); supabase.removeChannel(ch); };
  }, [gameId]);


  const mySeat = useMemo(() => players.find((p) => p.user_id === user.id)?.seat ?? null, [players, user.id]);
  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.display_name ?? "someone";
  const playerRoster = useMemo(() =>
    players.map((p) => ({
      seat: p.seat,
      name: nameOf(p.user_id),
      avatar_url: profiles.find((x) => x.id === p.user_id)?.avatar_url ?? null,
    })).sort((a, b) => a.seat - b.seat), [players, profiles]);

  // "It's your turn" gentle notification
  useEffect(() => {
    if (!game || game.status !== "active" || mySeat === null) return;
    const state = game.state as { turn?: number };
    if (state.turn === mySeat && announcedTurnRef.current !== `${game.id}:${state.turn}`) {
      announcedTurnRef.current = `${game.id}:${state.turn}`;
      toast(`Your turn 🎲`, { description: "make your move" });
    }
  }, [game, mySeat]);

  // Winner effect
  useEffect(() => {
    if (game?.status === "finished" && !showWin) setShowWin(true);
  }, [game?.status, showWin]);

  async function pushState(next: unknown, winnerSeat: number | null) {
    if (!game) return;
    const winnerId = winnerSeat !== null ? players.find((p) => p.seat === winnerSeat)?.user_id ?? null : null;
    await supabase.from("games").update({
      state: JSON.parse(JSON.stringify(next)),
      status: winnerSeat !== null ? "finished" : "active",
      winner_id: winnerId,
    }).eq("id", game.id);
  }

  function onRollLudo() {
    if (!game || mySeat === null) return;
    const state = game.state as LudoState;
    if (state.turn !== mySeat || state.rolled || rolling) return;
    setRolling(true);
    if (rollTimer.current) clearTimeout(rollTimer.current);
    rollTimer.current = setTimeout(() => {
      setRolling(false);
      const next = rollDice(state, mySeat);
      if (next) void pushState(next, next.winner);
    }, 700);
  }

  function onMoveLudo(pieceIdx: number) {
    if (!game || mySeat === null) return;
    const state = game.state as LudoState;
    const next = movePiece(state, mySeat, pieceIdx);
    if (next) void pushState(next, next.winner);
  }

  function onPlayTTT(cell: number) {
    if (!game) return;
    if (mySeat !== 0 && mySeat !== 1) {
      toast("You're watching this one", { description: "only the two players can make moves" });
      return;
    }
    const state = game.state as TTTState;
    if (state.winner !== null) return;
    if (state.turn !== mySeat) {
      const other = players.find((p) => p.seat === state.turn);
      toast("Hold on a sec 🌙", { description: `it's ${other ? nameOf(other.user_id) : "the other player"}'s turn` });
      return;
    }
    const next = playTTT(state, mySeat, cell);
    if (!next) return;
    const winnerSeat = next.winner === 0 || next.winner === 1 ? next.winner : null;
    void pushState(next, winnerSeat);
  }

  async function cancelGame() {
    if (!game) return;
    await supabase.from("game_invites").update({ status: "declined" }).eq("game_id", game.id).eq("status", "pending");
    await supabase.from("games").update({ status: "cancelled" }).eq("id", game.id);
  }

  async function playAgain() {
    if (!game) return;
    const seats = players.length;
    const fresh = game.kind === "ludo" ? initialLudo(seats) : initialTTT();
    setShowWin(false);
    await supabase.from("games").update({ status: "active", winner_id: null, state: JSON.parse(JSON.stringify(fresh)) }).eq("id", game.id);
  }

  function requestRestart() {
    if (window.confirm("Restart this game for both of you? Current progress will be cleared.")) {
      void playAgain();
    }
  }


  function requestRestart() {
    if (window.confirm("Restart this game for both of you? Current progress will be cleared.")) {
      void playAgain();
    }
  }

  function requestRestart() {
    if (window.confirm("Restart this game for both of you? Current progress will be cleared.")) {
      void playAgain();
    }
  }

  function requestRestart() {
    if (window.confirm("Restart this game for both of you? Current progress will be cleared.")) {
      void playAgain();
    }
  }

  function requestRestart() {
    if (window.confirm("Restart this game for both of you? Current progress will be cleared.")) {
      void playAgain();
    }
  }

  if (!game) {
    return <div className="flex-1 grid place-items-center p-8"><p className="text-plum/60 italic">loading the board…</p></div>;
  }

  if (game.status === "waiting") {
    return (
      <div className="flex-1 p-4 space-y-4" aria-label="Waiting for the other player">
        <Header title={game.kind === "ludo" ? "Ludo" : "Tic-tac-toe"} />
        <div className="glass-card rounded-3xl p-8 text-center space-y-3">
          <div className="text-5xl animate-pulse" aria-hidden="true">🎲</div>
          <p className="font-display text-xl text-plum">Invite sent — the board opens the moment they accept</p>
          <p className="text-sm text-muted-foreground italic">
            {playerRoster.length > 1 ? "everyone's in, starting…" : "no waiting room, no start button — just hang tight"}
          </p>
          {game.host_id === user.id && (
            <button onClick={cancelGame} className="mt-2 px-5 py-2 rounded-full bg-white/60 dark:bg-white/10 text-plum text-sm font-semibold">
              Cancel game
            </button>
          )}
        </div>
      </div>
    );
  }



  if (game.status === "cancelled") {
    return (
      <div className="flex-1 p-4 space-y-4">
        <Header title="Cancelled" />
        <div className="glass-card rounded-3xl p-8 text-center">
          <p className="font-display text-xl text-plum">This one wound down 🌙</p>
          <Link to="/games" className="mt-4 inline-block px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold">Back to Game Zone</Link>
        </div>
      </div>
    );
  }

  const winnerName = game.winner_id ? nameOf(game.winner_id) : null;

  return (
    <div className="flex-1 p-4 space-y-4">
        <Header title={game.kind === "ludo" ? "Ludo" : "Tic-tac-toe"} onRestart={requestRestart} />

      {game.kind === "ludo" ? (
        <>
          <LudoBoard state={game.state as LudoState} mySeat={mySeat} onMovePiece={onMoveLudo} players={playerRoster} />
          <div className="flex flex-col items-center gap-2">
            <Dice
              value={(game.state as LudoState).dice}
              rolling={rolling}
              onRoll={onRollLudo}
              disabled={mySeat === null || (game.state as LudoState).turn !== mySeat || (game.state as LudoState).rolled || game.status !== "active"}
            />
            <p className="text-xs text-muted-foreground italic">
              {game.status === "finished"
                ? "game over"
                : (game.state as LudoState).turn === mySeat
                  ? ((game.state as LudoState).rolled ? "pick a piece to move" : "your roll")
                  : `${nameOf(players.find((p) => p.seat === (game.state as LudoState).turn)?.user_id ?? "")}'s turn`}
            </p>
          </div>
        </>
      ) : (
        <>
          <TicTacToeBoard
            state={game.state as TTTState}
            mySeat={mySeat === 0 || mySeat === 1 ? mySeat : null}
            onPlay={onPlayTTT}
          />
          <p className="text-center text-sm text-muted-foreground italic">
            {game.status === "finished"
              ? "game over"
              : (game.state as TTTState).turn === mySeat
                ? "your turn"
                : `${nameOf(players.find((p) => p.seat === (game.state as TTTState).turn)?.user_id ?? "")}'s turn`}
          </p>
        </>
      )}

      {game.status === "finished" && (
        <div className="glass-card rounded-3xl p-6 text-center space-y-3 animate-fade-scale">
          <div className="text-4xl">🎉</div>
          <h2 className="font-display text-2xl text-plum">
            {winnerName ? `${winnerName} wins!` : "A friendly draw"}
          </h2>
          <p className="text-sm text-muted-foreground italic">warm hugs all around</p>
          <div className="flex gap-2 justify-center">
            <button onClick={playAgain} className="px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              Play again
            </button>
            <Link to="/games" className="px-5 py-2 rounded-full bg-white/60 text-plum text-sm font-semibold">Back</Link>
          </div>
        </div>
      )}

      <Confetti show={showWin && game.status === "finished" && !!winnerName} />
    </div>
  );
}

function Header({ title, onRestart }: { title: string; onRestart?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Link to="/games" className="p-2 rounded-full text-plum/70 hover:text-plum">
        <ArrowLeft className="w-5 h-5" />
      </Link>
      <h1 className="font-display text-2xl text-plum flex-1">{title}</h1>
      {onRestart && (
        <button onClick={onRestart} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 dark:bg-white/10 text-plum text-xs font-semibold hover:bg-white/80 transition" title="Restart for both players">
          <RefreshCw className="w-3.5 h-3.5" /> Restart
        </button>
      )}
    </div>
  );
}
