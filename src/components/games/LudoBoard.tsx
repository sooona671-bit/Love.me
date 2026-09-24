import type { LudoState } from "@/lib/ludo-engine";
import { LUDO_CONSTANTS, ownToShared, canMovePiece } from "@/lib/ludo-engine";

// Classic Ludo colors, softened into pastel yard + rich piece tones to match
// the app's rounded, pillowy "Blush & Bloom" aesthetic.
const SEAT_TINT = [
  { name: "Red", bg: "linear-gradient(160deg, #ffe3e8, #ffd0da)", ring: "#e8536b", piece: "linear-gradient(135deg, #f0687d, #d43a53)" },
  { name: "Green", bg: "linear-gradient(160deg, #e2f6ea, #cdeeda)", ring: "#3fa86a", piece: "linear-gradient(135deg, #57bf83, #2f8f5c)" },
  { name: "Blue", bg: "linear-gradient(160deg, #e3eefd, #d0e2fb)", ring: "#4a7fd6", piece: "linear-gradient(135deg, #6b9aec, #3766c2)" },
  { name: "Yellow", bg: "linear-gradient(160deg, #fff3d6, #ffe8b3)", ring: "#e0a72a", piece: "linear-gradient(135deg, #f4c24a, #d99d16)" },
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
    <div className="glass-card grid grid-cols-2 gap-3 p-4 rounded-[2rem] mx-auto max-w-md border border-primary/15 shadow-[0_14px_32px_-10px_rgba(232,107,136,0.25)]">
      {[0, 1, 2, 3].map((seat) => {
        if (seat >= state.seats) {
          return (
            <div key={seat} className="rounded-3xl grid place-items-center py-8 text-plum/40 text-xs italic bg-muted/40 border border-dashed border-border">
              open seat
            </div>
          );
        }
        const player = players.find((p) => p.seat === seat);
        const tint = SEAT_TINT[seat];
        const active = state.turn === seat && state.winner === null;
        const homed = state.pieces[seat].filter((p) => p === LUDO_CONSTANTS.HOME_FINISH).length;

        return (
          <div key={seat} className="rounded-3xl p-3 transition"
            style={{
              background: tint.bg,
              boxShadow: active ? `0 0 0 2.5px ${tint.ring}, 0 8px 20px -6px ${tint.ring}66` : "0 4px 14px -6px rgba(64,41,50,0.12)",
            }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-white grid place-items-center text-plum-deep text-xs font-display shadow-sm ring-2 ring-white">
                {player?.avatar_url ? <img src={player.avatar_url} className="w-full h-full object-cover" alt="" /> : (player?.name[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-plum-deep text-xs font-semibold truncate">{player?.name ?? "empty"}</p>
                <p className="text-plum-deep/60 text-[10px]">🏠 {homed}/4</p>
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
                    className={`aspect-square rounded-full grid place-items-center text-[10px] font-bold text-white transition
                      ${movable ? "animate-[gentle-tilt_1s_ease-in-out_infinite] ring-2 ring-offset-1 ring-primary hover:scale-110" : ""}
                      ${pos === LUDO_CONSTANTS.HOME_FINISH ? "opacity-70" : ""}`}
                    style={{ background: tint.piece, boxShadow: "0 3px 8px -2px rgba(64,41,50,0.35)" }}
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

      <div className="col-span-2 rounded-2xl p-3 space-y-1 bg-white/70 dark:bg-white/10 border border-primary/10">
        {state.log.slice(-4).map((line, i) => (
          <p key={i} className="text-[11px] text-plum-deep/80 italic">{line}</p>
        ))}
      </div>
    </div>
  );
}