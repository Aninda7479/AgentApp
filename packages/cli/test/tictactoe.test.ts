import { describe, expect, it } from "vitest";
import {
  bestMove,
  createBoard,
  formatBoard,
  getStatus,
  makeMove,
  otherPlayer,
} from "../src/tictactoe/game.js";

describe("tictactoe core logic", () => {
  it("starts with an empty board and X to move", () => {
    const board = createBoard();
    const status = getStatus(board);
    expect(status).toEqual({ kind: "playing", turn: "X" });
  });

  it("detects a row win for X", () => {
    let board = createBoard();
    board = makeMove(board, 0, "X");
    board = makeMove(board, 3, "O");
    board = makeMove(board, 1, "X");
    board = makeMove(board, 4, "O");
    board = makeMove(board, 2, "X");
    const status = getStatus(board);
    expect(status.kind).toBe("win");
    if (status.kind === "win") {
      expect(status.winner).toBe("X");
      expect(status.line).toEqual([0, 1, 2]);
    }
  });

  it("detects a draw", () => {
    // X O X
    // X O O
    // O X X
    let board = createBoard();
    const moves: [number, "X" | "O"][] = [
      [0, "X"],
      [1, "O"],
      [2, "X"],
      [4, "O"],
      [3, "X"],
      [5, "O"],
      [7, "X"],
      [6, "O"],
      [8, "X"],
    ];
    for (const [i, p] of moves) board = makeMove(board, i, p);
    expect(getStatus(board)).toEqual({ kind: "draw" });
  });

  it("rejects moves on occupied cells", () => {
    let board = createBoard();
    board = makeMove(board, 0, "X");
    expect(() => makeMove(board, 0, "O")).toThrow();
  });

  it("rejects out-of-turn moves", () => {
    const board = createBoard();
    expect(() => makeMove(board, 0, "O")).toThrow();
  });

  it("otherPlayer flips correctly", () => {
    expect(otherPlayer("X")).toBe("O");
    expect(otherPlayer("O")).toBe("X");
  });

  it("bestMove blocks an opponent win", () => {
    // O is about to win on the top row: O O _ with X elsewhere.
    let board = createBoard();
    board = makeMove(board, 0, "O");
    board = makeMove(board, 3, "X");
    board = makeMove(board, 1, "O");
    board = makeMove(board, 4, "X");
    // It's O's turn; best move should complete the win at index 2.
    const move = bestMove(board, "O");
    expect(move).toBe(2);
  });

  it("formatBoard shows numbers on empty cells", () => {
    const out = formatBoard(createBoard());
    expect(out).toContain("1");
    expect(out).toContain("9");
  });
});
