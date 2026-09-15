import type { TTTState } from "@/lib/tictactoe-engine";

const SEAT_COLORS = ["oklch(0.72 0.17 15)", "oklch(0.72 0.08 300)"];

export function TicTacToeBoard({ state, mySeat, onPlay }: {
  state: TTTState;
  mySeat: 0 | 1 | null;
  onPlay: (cell: number) => void;
}) {
  const myTurn = mySeat !== null && state.turn === mySeat && state.winner === null;
  const playable = mySeat !== null && state.winner === null;
  return (
    <div className="grid grid-cols-3 gap-3 p-4 rounded-3xl mx-auto max-w-sm"
      style={{ background: "linear-gradient(140deg, oklch(0.32 0.09 330), oklch(0.24 0.08 320))" }}>
      {state.board.map((cell, i) => {
        const winning = state.winLine?.includes(i);
        return (
          <button
            key={i}
            data-ttt-cell={i}
            data-ttt-value={cell === null ? "" : cell === 0 ? "x" : "o"}
            aria-label={`Square ${i + 1}${cell === null ? ", empty" : cell === 0 ? ", X" : ", O"}`}
            disabled={!playable || cell !== null}
            onClick={() => onPlay(i)}

            className={`aspect-square rounded-2xl grid place-items-center transition
              ${cell === null && myTurn ? "hover:scale-[1.03]" : ""}
              ${winning ? "ring-4 ring-muted-gold" : ""}`}
            style={{
              background: "oklch(0.97 0.02 60 / 0.92)",
              boxShadow: "inset 0 -3px 0 oklch(0.85 0.05 320 / 0.5)",
            }}
          >
            {cell !== null && (
              <svg viewBox="0 0 40 40" className="w-2/3 h-2/3">
                {cell === 0 ? (
                  <>
                    <line x1="8" y1="8" x2="32" y2="32" stroke={SEAT_COLORS[0]} strokeWidth="5" strokeLinecap="round" />
                    <line x1="32" y1="8" x2="8" y2="32" stroke={SEAT_COLORS[0]} strokeWidth="5" strokeLinecap="round" />
                  </>
                ) : (
                  <circle cx="20" cy="20" r="12" fill="none" stroke={SEAT_COLORS[1]} strokeWidth="5" />
                )}
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
