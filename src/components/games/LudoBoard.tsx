import { Dices, Users } from "lucide-react";

import type { LudoState } from "@/lib/ludo-engine";
import { LUDO_CONSTANTS, ownToShared, canMovePiece } from "@/lib/ludo-engine";

const COLORS = [
  { name: "RED", main: "#e52521", dark: "#b91c1c", soft: "#ffe3e8", yard: "#fff7f8", ring: "#e8536b" },
  { name: "GREEN", main: "#0ea44b", dark: "#047857", soft: "#e2f6ea", yard: "#f4fff8", ring: "#10a95a" },
  { name: "BLUE", main: "#136cdb", dark: "#1d4ed8", soft: "#e3eefd", yard: "#f5f9ff", ring: "#4a7fd6" },
  { name: "YELLOW", main: "#f9b208", dark: "#d97706", soft: "#fff3d6", yard: "#fffaf0", ring: "#e0a72a" },
] as const;

const TRACK_52: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0],
];

const HOME_STRAIGHTS: Record<number, [number, number][]> = {
  0: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  1: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  2: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  3: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
};

const BASE_POCKETS: Record<number, [number, number][]> = {
  0: [[2, 2], [2, 3], [3, 2], [3, 3]],
  1: [[2, 11], [2, 12], [3, 11], [3, 12]],
  2: [[11, 2], [11, 3], [12, 2], [12, 3]],
  3: [[11, 11], [11, 12], [12, 11], [12, 12]],
};

const CENTER_DESTINATION: Record<number, [number, number]> = {
  0: [7, 6], 1: [6, 7], 2: [8, 7], 3: [7, 8],
};

function cellCenter(row: number, col: number) {
  return { left: `${((col + 0.5) / 15) * 100}%`, top: `${((row + 0.5) / 15) * 100}%` };
}

function getPiecePosition(seat: number, position: number, pieceIndex: number) {
  if (position === -1) {
    const [r, c] = BASE_POCKETS[seat][pieceIndex];
    return cellCenter(r, c);
  }
  if (position === LUDO_CONSTANTS.HOME_FINISH) {
    const [r, c] = CENTER_DESTINATION[seat];
    const offsets = [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]];
    const [ox, oy] = offsets[pieceIndex];
    return {
      left: `calc(${((c + 0.5) / 15) * 100}% + ${ox * 5}px)`,
      top: `calc(${((r + 0.5) / 15) * 100}% + ${oy * 5}px)`,
    };
  }
  if (position >= LUDO_CONSTANTS.HOME_START && position < LUDO_CONSTANTS.HOME_FINISH) {
    const index = position - LUDO_CONSTANTS.HOME_START;
    const [r, c] = HOME_STRAIGHTS[seat][index];
    return cellCenter(r, c);
  }
  const sharedIndex = ownToShared(seat, position)!;
  const [r, c] = TRACK_52[sharedIndex];
  return cellCenter(r, c);
}

function getCellBackground(row: number, col: number) {
  if (row < 6 && col < 6) return COLORS[0].main;
  if (row < 6 && col > 8) return COLORS[1].main;
  if (row > 8 && col < 6) return COLORS[2].main;
  if (row > 8 && col > 8) return COLORS[3].main;
  if (row === 7 && col >= 1 && col <= 5) return COLORS[0].main;
  if (col === 7 && row >= 1 && row <= 5) return COLORS[1].main;
  if (row === 7 && col >= 9 && col <= 13) return COLORS[3].main;
  if (col === 7 && row >= 9 && row <= 13) return COLORS[2].main;
  if (row === 6 && col === 1) return COLORS[0].main;
  if (row === 1 && col === 8) return COLORS[1].main;
  if (row === 13 && col === 6) return COLORS[2].main;
  if (row === 8 && col === 13) return COLORS[3].main;
  return "#ffffff";
}

function isSafeCell(row: number, col: number) {
  return (row === 8 && col === 2) || (row === 2 && col === 6) || (row === 6 && col === 12) || (row === 12 && col === 8);
}

function DiceFace({ value, rolling }: { value: number; rolling: boolean }) {
  const pipPositions: Record<number, string[]> = {
    1: ["center"],
    2: ["top-left", "bottom-right"],
    3: ["top-left", "center", "bottom-right"],
    4: ["top-left", "top-right", "bottom-left", "bottom-right"],
    5: ["top-left", "top-right", "center", "bottom-left", "bottom-right"],
    6: ["top-left", "top-right", "middle-left", "middle-right", "bottom-left", "bottom-right"],
  };
  const positions = pipPositions[value] ?? pipPositions[1];
  const positionClass: Record<string, string> = {
    "top-left": "left-[19%] top-[19%]",
    "top-right": "right-[19%] top-[19%]",
    "middle-left": "left-[19%] top-1/2 -translate-y-1/2",
    "middle-right": "right-[19%] top-1/2 -translate-y-1/2",
    center: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
    "bottom-left": "left-[19%] bottom-[19%]",
    "bottom-right": "right-[19%] bottom-[19%]",
  };
  return (
    <div className={`relative w-full h-full rounded-[17px] bg-gradient-to-br from-white via-[#fff9fb] to-[#ffe9ef] border-2 border-[#ffc4d1] shadow-[inset_0_2px_3px_rgba(255,255,255,.95),0_6px_16px_rgba(232,107,136,.22)] ${rolling ? "animate-ludo-dice" : ""}`}>
      {positions.map((position, index) => (
        <span
          key={`${position}-${index}`}
          className={`absolute w-[19%] aspect-square rounded-full bg-[#e45c7d] shadow-[inset_0_2px_2px_rgba(255,255,255,.35),0_2px_3px_rgba(137,39,65,.25)] ${positionClass[position]}`}
        />
      ))}
    </div>
  );
}

export function LudoBoard({
  state, mySeat, onMovePiece, players, onRoll, rolling = false,
}: {
  state: LudoState;
  mySeat: number | null;
  onMovePiece: (pieceIdx: number) => void;
  players: { seat: number; name: string; avatar_url: string | null }[];
  onRoll?: () => void;
  rolling?: boolean;
}) {
  const activeSeat = state.turn;
  const activePlayer = players.find((p) => p.seat === activeSeat);
  const activeColor = COLORS[activeSeat] ?? COLORS[0];
  const roll = state.rolled ? state.dice ?? 0 : 0;
  const canRoll = !!onRoll && mySeat !== null && mySeat === state.turn && !state.rolled && !rolling && state.winner === null;

  return (
    <div className="w-full max-w-[420px] mx-auto space-y-2">
      {/* Turn status */}
      <div className="bg-white/95 backdrop-blur-md border border-[#e2c7cc] rounded-[19px] px-3 py-2.5 flex items-center justify-between shadow-[0_5px_16px_-8px_rgba(42,21,30,.22)]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-full text-white flex items-center justify-center font-black text-sm shadow-[inset_0_2px_2px_rgba(255,255,255,.4),0_3px_7px_rgba(0,0,0,.16)] ring-2 ring-white"
            style={{ background: `linear-gradient(145deg, ${activeColor.main}, ${activeColor.dark})` }}>
            {(activePlayer?.name?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-extrabold text-[13px] truncate">
              {activePlayer?.name ?? `Player ${activeSeat + 1}`}'s Turn
              {roll === 6 && <span className="text-[#e86b88]"> • Bonus Roll!</span>}
            </p>
            <p className="text-[10px] text-[#735762] leading-tight">
              {state.winner !== null ? "Game finished" : state.rolled ? "Choose a glowing piece to move" : "Roll the dice to continue"}
            </p>
          </div>
        </div>
        {state.rolled && (
          <div className="shrink-0 px-3 py-1.5 rounded-xl bg-[#fff4f7] border border-[#fcc8d8]">
            <p className="text-[9px] font-bold text-[#d4496f]">Rolled:</p>
            <p className="text-lg font-black text-[#b73256] leading-none text-center">{roll}</p>
          </div>
        )}
      </div>

      {/* Player cards */}
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((seat) => {
          if (seat >= state.seats) return null;
          const player = players.find((p) => p.seat === seat);
          const color = COLORS[seat];
          const active = state.turn === seat && state.winner === null;
          const homeCount = state.pieces?.[seat]?.filter((p) => p === LUDO_CONSTANTS.HOME_FINISH).length ?? 0;
          return (
            <div key={seat} className="rounded-[18px] bg-white/95 border px-2.5 py-2 flex items-center gap-2 transition"
              style={{
                borderColor: active ? color.ring : "#efd9dd",
                boxShadow: active ? `0 0 0 2px ${color.main}, 0 8px 20px -10px ${color.main}` : "0 4px 12px -8px rgba(42,21,30,.2)",
              }}>
              <div className="w-9 h-9 rounded-full shrink-0 overflow-hidden text-white flex items-center justify-center font-black shadow-[inset_0_2px_2px_rgba(255,255,255,.35),0_3px_7px_rgba(0,0,0,.16)]"
                style={{ background: `linear-gradient(145deg, ${color.main}, ${color.dark})` }}>
                {player?.avatar_url ? <img src={player.avatar_url} alt="" className="w-full h-full object-cover" /> : (player?.name?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-extrabold text-[12px] truncate">{player?.name ?? "Waiting..."}</p>
                <p className="text-[10px] font-bold" style={{ color: color.main }}>{color.name} • {homeCount}/4 Home</p>
              </div>
              {active && (
                <span className="ml-auto w-2.5 h-2.5 rounded-full animate-pulse shrink-0" style={{ background: color.main, boxShadow: `0 0 7px ${color.main}` }} />
              )}
            </div>
          );
        })}
      </div>

      {/* 15x15 board */}
      <div className="w-full max-w-[390px] mx-auto bg-white rounded-[21px] p-1.5 border border-[#dfc5ca] board-shadow relative">
        <div className="relative w-full aspect-square rounded-[14px] overflow-hidden border border-black/55 bg-white">
          <div className="absolute inset-0 grid grid-cols-15 grid-rows-15">
            {Array.from({ length: 225 }, (_, index) => {
              const row = Math.floor(index / 15);
              const col = index % 15;
              const bg = getCellBackground(row, col);
              let content: React.ReactNode = null;
              if ((row === 6 && col === 1) || (row === 1 && col === 8) || (row === 13 && col === 6) || (row === 8 && col === 13) || isSafeCell(row, col)) content = "★";
              if (row === 7 && col === 0) content = "▶";
              if (row === 0 && col === 7) content = "▼";
              if (row === 7 && col === 14) content = "◀";
              if (row === 14 && col === 7) content = "▲";
              const textColor = bg === "#ffffff" ? "#4b5563" : "#ffffff";
              return (
                <div key={index} className="border border-black/15 flex items-center justify-center text-[8px] sm:text-[10px] font-black select-none"
                  style={{ background: bg, color: textColor }}>
                  {content}
                </div>
              );
            })}
          </div>

          {[0, 1, 2, 3].map((seat) => {
            const color = COLORS[seat];
            const positionClass = seat === 0 ? "left-0 top-0" : seat === 1 ? "right-0 top-0" : seat === 2 ? "left-0 bottom-0" : "right-0 bottom-0";
            return (
              <div key={seat} className={`absolute w-[40%] h-[40%] p-[2%] ${positionClass} z-10 pointer-events-none`}>
                <div className="w-full h-full rounded-[15px] p-[7%] grid grid-cols-2 grid-rows-2 gap-[7%] border-2 border-black/10 shadow-[inset_0_2px_4px_rgba(255,255,255,.8),0_4px_8px_rgba(0,0,0,.16)]"
                  style={{ background: color.yard }}>
                  {[0, 1, 2, 3].map((slot) => (
                    <div key={slot} className="rounded-full border-2 border-black/10 shadow-inner flex items-center justify-center" style={{ background: color.soft }}>
                      <span className="w-[30%] aspect-square rounded-full" style={{ background: color.main, boxShadow: `0 2px 4px ${color.dark}55` }} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="absolute left-[40%] top-[40%] w-[20%] h-[20%] z-20 overflow-hidden border border-black/20">
            <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
              <polygon points="0,0 50,50 0,100" fill={COLORS[0].main} />
              <polygon points="0,0 50,50 100,0" fill={COLORS[1].main} />
              <polygon points="100,0 50,50 100,100" fill={COLORS[3].main} />
              <polygon points="0,100 50,50 100,100" fill={COLORS[2].main} />
              <circle cx="50" cy="50" r="14" fill="white" stroke="#d97706" strokeWidth="2" />
              <text x="50" y="55" fontSize="13" textAnchor="middle" fill="#d97706">♛</text>
            </svg>
          </div>

          <div className="absolute inset-0 z-30 pointer-events-none">
            {[0, 1, 2, 3].map((seat) => {
              if (seat >= state.seats) return null;
              const color = COLORS[seat];
              const pieces = state.pieces?.[seat] ?? [];
              return pieces.map((position, pieceIndex) => {
                const isMine = mySeat === seat;
                const movable = isMine && state.rolled && roll > 0 && state.turn === seat && canMovePiece(state, seat, pieceIndex, roll);
                const pos = getPiecePosition(seat, position, pieceIndex);
                return (
                  <button
                    key={`${seat}-${pieceIndex}`}
                    type="button"
                    disabled={!movable}
                    onClick={() => onMovePiece(pieceIndex)}
               className={`absolute w-[6.2%] aspect-square rounded-full pointer-events-auto flex items-center justify-center text-white text-[9px] sm:text-[11px] font-black border-[1.5px] border-white transition-[left,top,filter,box-shadow] duration-300 ease-in-out ${movable ? "animate-ludo-glow cursor-pointer" : "cursor-default"}`}
                    style={{
                      left: pos.left, top: pos.top, transform: "translate(-50%, -50%)",
                      background: `linear-gradient(145deg, ${color.main}, ${color.dark})`,
                      boxShadow: movable
                        ? `0 0 7px white, 0 0 14px ${color.main}, 0 5px 8px rgba(0,0,0,.35), inset 0 2px 3px rgba(255,255,255,.7), inset 0 -3px 4px rgba(0,0,0,.35)`
                        : "0 5px 8px rgba(0,0,0,.35), inset 0 2px 3px rgba(255,255,255,.7), inset 0 -3px 4px rgba(0,0,0,.35)",
                    }}
                    title={`Piece ${pieceIndex + 1}`}
                  >
                    {position === LUDO_CONSTANTS.HOME_FINISH ? "★" : pieceIndex + 1}
                  </button>
                );
              });
            })}
          </div>
        </div>
      </div>

      {/* Playing now + dice + roll */}
      <div className={`bg-white/95 border border-[#e2c7cc] rounded-[22px] p-2.5 sm:p-3 flex items-center gap-2 shadow-[0_12px_28px_-14px_rgba(42,21,30,.35)] transition-[box-shadow] duration-300 ${canRoll ? "ring-2 ring-[#f9a8bb]/45" : ""}`}>
        <div className="w-11 h-11 shrink-0 rounded-full text-white flex items-center justify-center font-black shadow-[inset_0_2px_2px_rgba(255,255,255,.4),0_4px_8px_rgba(0,0,0,.16)]"
          style={{ background: `linear-gradient(145deg, ${activeColor.main}, ${activeColor.dark})` }}>
          {(activePlayer?.name?.[0] ?? "?").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black text-[#735762] uppercase tracking-wide">Playing Now</p>
          <p className="font-extrabold text-[13px] truncate">
            {activePlayer?.name ?? `Player ${activeSeat + 1}`} <span style={{ color: activeColor.main }}>({activeColor.name})</span>
          </p>
          <p className="text-[10px] font-bold truncate" style={{ color: activeColor.main }}>
            {state.rolled ? "Pick a glowing piece!" : canRoll ? "Your turn to roll!" : "Waiting for turn..."}
          </p>
        </div>
        <div className="w-[58px] h-[58px] shrink-0">
          {roll > 0 ? (
            <DiceFace value={roll} rolling={rolling} />
          ) : (
            <div className={`relative w-full h-full rounded-[17px] bg-gradient-to-br from-white via-[#fff9fb] to-[#ffe9ef] border-2 border-[#ffc4d1] shadow-[inset_0_2px_3px_rgba(255,255,255,.95),0_6px_16px_rgba(232,107,136,.22)] ${rolling ? "animate-ludo-dice" : ""}`}>
              <Dices className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 text-[#e45c7d]" strokeWidth={2.2} />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRoll}
          disabled={!canRoll}
          className={`relative h-[58px] min-w-[82px] px-3.5 shrink-0 rounded-[18px] text-white font-black text-[14px] flex items-center justify-center gap-1.5 select-none transition-[transform,box-shadow,filter,opacity] duration-150 ${
            canRoll
              ? "bg-gradient-to-br from-[#f16f8e] to-[#e65376] shadow-[0_8px_16px_-6px_rgba(232,83,118,.72)] hover:brightness-[1.04] hover:-translate-y-[1px] active:translate-y-[2px] active:scale-[.97] cursor-pointer"
              : "bg-gradient-to-br from-[#efb7c4] to-[#eda5b6] shadow-[0_5px_12px_-7px_rgba(232,83,118,.45)] opacity-55 cursor-not-allowed"
          }`}
        >
          <Dices className={`w-[17px] h-[17px] ${rolling ? "animate-spin" : ""}`} />
          <span>{rolling ? "Rolling" : "Roll"}</span>
          {canRoll && !rolling && <span className="absolute inset-0 rounded-[18px] ring-1 ring-white/30 pointer-events-none" />}
        </button>
      </div>

      <div className="flex items-center justify-center gap-1 text-[10px] font-semibold text-[#9a7b85] pt-1">
        <Users className="w-3 h-3" /> {state.seats}/4 Players
      </div>

      <style>{`
        @keyframes ludoGlow {
          0% { transform: translate(-50%, -50%) scale(1); filter: drop-shadow(0 0 2px white); }
          50% { transform: translate(-50%, -50%) scale(1.12); filter: drop-shadow(0 0 5px white) drop-shadow(0 0 7px currentColor); }
          100% { transform: translate(-50%, -50%) scale(1.06); filter: drop-shadow(0 0 4px white); }
        }
        @keyframes ludoDice {
          0% { transform: rotate(0deg) scale(1); }
          18% { transform: rotate(-8deg) scale(1.04); }
          36% { transform: rotate(8deg) scale(1.08); }
          54% { transform: rotate(-6deg) scale(1.05); }
          72% { transform: rotate(4deg) scale(1.03); }
          100% { transform: rotate(0deg) scale(1); }
        }
        .animate-ludo-glow { animation: ludoGlow 1s cubic-bezier(.4,0,.2,1) infinite; will-change: transform, filter; }
        .animate-ludo-dice { animation: ludoDice 650ms cubic-bezier(.22,.8,.32,1) both; will-change: transform; }
        .board-shadow { box-shadow: 0 18px 36px -16px rgba(42,21,30,.35), 0 0 0 4px #fff, 0 0 0 6px #dcc0c3, 0 8px 20px rgba(0,0,0,.10); }
        .grid-cols-15 { grid-template-columns: repeat(15, minmax(0, 1fr)); }
        .grid-rows-15 { grid-template-rows: repeat(15, minmax(0, 1fr)); }
        @media (prefers-reduced-motion: reduce) {
          .animate-ludo-glow, .animate-ludo-dice { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
