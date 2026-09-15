export type TTTCell = 0 | 1 | null; // 0 = seat 0 (coral X), 1 = seat 1 (lavender O)
export type TTTState = {
  board: TTTCell[]; // length 9
  turn: 0 | 1;
  winner: 0 | 1 | "draw" | null;
  winLine: number[] | null;
};

export function initialTTT(): TTTState {
  return { board: Array(9).fill(null) as TTTCell[], turn: 0, winner: null, winLine: null };
}

const LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function checkWin(board: TTTCell[]): { winner: 0 | 1 | "draw" | null; line: number[] | null } {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a] as 0 | 1, line };
    }
  }
  if (board.every((c) => c !== null)) return { winner: "draw", line: null };
  return { winner: null, line: null };
}

export function playTTT(state: TTTState, seat: 0 | 1, cell: number): TTTState | null {
  if (state.winner !== null) return null;
  if (state.turn !== seat) return null;
  if (cell < 0 || cell > 8 || state.board[cell] !== null) return null;
  const board = state.board.slice();
  board[cell] = seat;
  const { winner, line } = checkWin(board);
  return {
    board,
    turn: (seat === 0 ? 1 : 0),
    winner,
    winLine: line,
  };
}
