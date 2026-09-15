// Simplified Ludo engine — 4 seats, 4 pieces each.
// Track is a linear "path index" 0..56 for each player's own perspective:
//   -1 = at home yard (needs a 6 to enter)
//   0..51 = around the shared 52-square main loop (each player's own numbering)
//   52..56 = home column (5 tiles)
//   57 = home (finished)
// We convert own-index to a shared board cell via startOffset per seat when checking captures.

export type LudoPieces = number[]; // length 4, each is -1..57 (57 = home)
export type LudoState = {
  pieces: LudoPieces[]; // per seat, 4 pieces
  turn: number; // current seat index (0..seats-1)
  dice: number | null; // last roll
  rolled: boolean; // dice already rolled and awaiting move
  sixStreak: number; // consecutive sixes for current seat
  winner: number | null;
  seats: number; // number of seats in this game
  log: string[]; // last few event messages
};

const START_OFFSETS = [0, 13, 26, 39]; // seat's start cell on the 52-loop
const MAIN_LEN = 52;
const HOME_START = 52; // own-index of first home-column tile
const HOME_FINISH = 57;
// Safe cells on the shared 52-loop (starts + star tiles)
const SAFE_SHARED = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export function initialLudo(seats: number): LudoState {
  return {
    pieces: Array.from({ length: seats }, () => [-1, -1, -1, -1]),
    turn: 0,
    dice: null,
    rolled: false,
    sixStreak: 0,
    winner: null,
    seats,
    log: ["Game on 🎲"],
  };
}

export function ownToShared(seat: number, own: number): number | null {
  if (own < 0 || own >= HOME_START) return null; // home yard or home column: not on shared loop
  return (START_OFFSETS[seat] + own) % MAIN_LEN;
}

export function canMovePiece(state: LudoState, seat: number, pieceIdx: number, roll: number): boolean {
  if (state.winner !== null) return false;
  if (state.turn !== seat) return false;
  const pos = state.pieces[seat][pieceIdx];
  if (pos === HOME_FINISH) return false;
  if (pos === -1) return roll === 6;
  const next = pos + roll;
  if (next > HOME_FINISH) return false;
  return true;
}

export function hasAnyMove(state: LudoState, seat: number, roll: number): boolean {
  for (let i = 0; i < 4; i++) if (canMovePiece(state, seat, i, roll)) return true;
  return false;
}

export function rollDice(state: LudoState, seat: number, forced?: number): LudoState | null {
  if (state.winner !== null) return null;
  if (state.turn !== seat) return null;
  if (state.rolled) return null;
  const roll = forced ?? (1 + Math.floor(Math.random() * 6));
  const streak = roll === 6 ? state.sixStreak + 1 : state.sixStreak;
  // Three sixes in a row = lose the turn
  if (streak >= 3) {
    return {
      ...state,
      dice: roll,
      rolled: false,
      sixStreak: 0,
      turn: nextSeat(state.turn, state.seats),
      log: appendLog(state.log, `${seatName(seat)} rolled 6·6·6 — turn skipped`),
    };
  }
  // If no move possible, pass turn (unless a 6, then keep dice for potential — but if truly no move, pass anyway)
  if (!hasAnyMove({ ...state, dice: roll, rolled: true }, seat, roll)) {
    return {
      ...state,
      dice: roll,
      rolled: false,
      sixStreak: roll === 6 ? streak : 0,
      turn: roll === 6 ? seat : nextSeat(state.turn, state.seats),
      log: appendLog(state.log, `${seatName(seat)} rolled ${roll} · no moves`),
    };
  }
  return {
    ...state,
    dice: roll,
    rolled: true,
    sixStreak: streak,
    log: appendLog(state.log, `${seatName(seat)} rolled ${roll}`),
  };
}

export function movePiece(state: LudoState, seat: number, pieceIdx: number): LudoState | null {
  if (state.winner !== null) return null;
  if (state.turn !== seat) return null;
  if (!state.rolled || state.dice == null) return null;
  const roll = state.dice;
  if (!canMovePiece(state, seat, pieceIdx, roll)) return null;

  const pieces = state.pieces.map((arr) => arr.slice());
  const from = pieces[seat][pieceIdx];
  const to = from === -1 ? 0 : from + roll;
  pieces[seat][pieceIdx] = to;

  let log = state.log;
  // Capture — only on shared loop, non-safe cell
  if (to < HOME_START) {
    const sharedCell = ownToShared(seat, to)!;
    if (!SAFE_SHARED.has(sharedCell)) {
      for (let s = 0; s < state.seats; s++) {
        if (s === seat) continue;
        for (let i = 0; i < 4; i++) {
          const op = pieces[s][i];
          if (op < 0 || op >= HOME_START) continue;
          const opShared = ownToShared(s, op)!;
          if (opShared === sharedCell) {
            pieces[s][i] = -1;
            log = appendLog(log, `${seatName(seat)} captured ${seatName(s)}!`);
          }
        }
      }
    }
  }
  if (to === HOME_FINISH) {
    log = appendLog(log, `${seatName(seat)}'s piece is home 🏠`);
  }

  const winner = pieces[seat].every((p) => p === HOME_FINISH) ? seat : null;
  const extraTurn = roll === 6 || to === HOME_FINISH;

  return {
    ...state,
    pieces,
    dice: null,
    rolled: false,
    sixStreak: extraTurn ? state.sixStreak : 0,
    turn: winner !== null ? seat : (extraTurn ? seat : nextSeat(state.turn, state.seats)),
    winner,
    log,
  };
}

function nextSeat(cur: number, seats: number) { return (cur + 1) % seats; }
function seatName(s: number) { return ["Coral", "Lavender", "Rose", "Gold"][s] ?? `P${s}`; }
function appendLog(log: string[], msg: string) { return [...log.slice(-6), msg]; }

export const LUDO_CONSTANTS = { START_OFFSETS, MAIN_LEN, HOME_START, HOME_FINISH, SAFE_SHARED };
