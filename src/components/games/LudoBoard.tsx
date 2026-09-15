import type { LudoState } from "@/lib/ludo-engine";
import { LUDO_CONSTANTS, ownToShared, canMovePiece } from "@/lib/ludo-engine";

const SEAT_TINT = [
  { bg: "oklch(0.88 0.10 25 / 0.35)", piece: "linear-gradient(135deg, oklch(0.78 0.15 25), oklch(0.70 0.17 15))" },
  { bg: "oklch(0.88 0.06 300 / 0.45)", piece: "linear-gradient(135deg, oklch(0.90 0.05 300), oklch(0.78 0.08 300))" },
  { bg: "oklch(0.88 0.09 12 / 0.35)", piece: "linear-gradient(135deg, oklch(0.82 0.09 12), oklch(0.72 0.11 5))" },
  { bg: "oklch(0.90 0.10 82 / 0.45)", piece: "linear-gradient(135deg, oklch(0.86 0.09 82), oklch(0.76 0.12 76))" },
];

// Simplified 4-quadrant layout (not a true 15x15 cross — a friendly visual approximation for the family app).
// Each seat shows its 4-piece yard, current position summary, and pieces are clickable when movable.

export function LudoBoard({
  state, mySeat, onMovePiece, players,
}: {
  state: LudoState;
  mySeat: number | null;
  onMovePiece: (pieceIdx: number) => void;
  players: { seat: number; name: string; avatar_url: string | null }[];
}) {
  const roll = state.rolled ? state.dice ?? 0 : 0;
  return (
    <div className="grid grid-cols-2 gap-3 p-4 rounded-3xl mx-auto max-w-md"
      style={{ background: "linear-gradient(140deg, oklch(0.34 0.10 330), oklch(0.22 0.08 320))" }}>
      {[0, 1, 2, 3].map((seat) => {
        if (seat >= state.seats) {
          return (
            <div key={seat} className="rounded-3xl grid place-items-center py-8 text-white/40 text-xs italic"
              style={{ background: "oklch(0.24 0.05 320 / 0.35)" }}>
              open seat
            </div>
          );
        }
        const player = players.find((p) => p.seat === seat);
        const tint = SEAT_TINT[seat];
        const active = state.turn === seat && state.winner === null;
        const homed = state.pieces[seat].filter((p) => p === LUDO_CONSTANTS.HOME_FINISH).length;

        return (
          <div key={seat} className={`rounded-3xl p-3 transition ${active ? "ring-2 ring-muted-gold shadow-lg" : ""}`}
            style={{ background: tint.bg }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 blob overflow-hidden bg-white/50 grid place-items-center text-plum-deep text-xs font-display">
                {player?.avatar_url ? <img src={player.avatar_url} className="w-full h-full object-cover" alt="" /> : (player?.name[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-white text-xs font-semibold truncate">{player?.name ?? "empty"}</p>
                <p className="text-white/70 text-[10px]">🏠 {homed}/4</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {state.pieces[seat].map((pos, i) => {
                const isMine = mySeat === seat;
                const movable = isMine && roll > 0 && canMovePiece(state, seat, i, roll);
                const label = pos === -1 ? "yard" : pos === LUDO_CONSTANTS.HOME_FINISH ? "🏠" : pos >= LUDO_CONSTANTS.HOME_START ? `H${pos - LUDO_CONSTANTS.HOME_START + 1}` : String(ownToShared(seat, pos));
                return (
                  <button
                    key={i}
                    disabled={!movable}
                    onClick={() => onMovePiece(i)}
                    className={`aspect-square rounded-2xl grid place-items-center text-[10px] font-bold text-plum-deep transition
                      ${movable ? "animate-[gentle-tilt_1s_ease-in-out_infinite] ring-2 ring-muted-gold hover:scale-110" : ""}
                      ${pos === LUDO_CONSTANTS.HOME_FINISH ? "opacity-70" : ""}`}
                    style={{ background: tint.piece, boxShadow: "0 3px 10px -3px oklch(0.20 0.06 320 / 0.5)" }}
                    title={`Piece ${i + 1} · ${label}`}
                  >
                    {pos === -1 ? "" : pos === LUDO_CONSTANTS.HOME_FINISH ? "🏠" : "●"}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="col-span-2 rounded-2xl p-3 space-y-1"
        style={{ background: "oklch(0.99 0.01 30 / 0.15)" }}>
        {state.log.slice(-4).map((line, i) => (
          <p key={i} className="text-[11px] text-white/85 italic">{line}</p>
        ))}
      </div>
    </div>
  );
}
