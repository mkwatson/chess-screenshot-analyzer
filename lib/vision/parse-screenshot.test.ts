import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock `ai`'s generateObject before importing the SUT.
const generateObjectMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateObject: (...args: unknown[]): Promise<unknown> => generateObjectMock(...args),
  };
});

import { parseScreenshot } from "./parse-screenshot";

type Cell = "" | "p" | "n" | "b" | "r" | "q" | "k" | "P" | "N" | "B" | "R" | "Q" | "K";
type Grid = Cell[][];

// Starting position as a grid (rank 8 first → rank 1).
const STARTING_GRID: Grid = [
  ["r", "n", "b", "q", "k", "b", "n", "r"],
  ["p", "p", "p", "p", "p", "p", "p", "p"],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["P", "P", "P", "P", "P", "P", "P", "P"],
  ["R", "N", "B", "Q", "K", "B", "N", "R"],
];

// Two-white-kings (cell h1 is K instead of R) — chessops rejects as illegal.
const ILLEGAL_GRID: Grid = [
  ["r", "n", "b", "q", "k", "b", "n", "r"],
  ["p", "p", "p", "p", "p", "p", "p", "p"],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["P", "P", "P", "P", "P", "P", "P", "P"],
  ["R", "N", "B", "Q", "K", "B", "N", "K"],
];

const VALID_INPUT = {
  imageBase64: "iVBORw0KGgo=",
  mimeType: "image/png" as const,
};

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

beforeEach(() => {
  generateObjectMock.mockReset();
});

describe("parseScreenshot", () => {
  it("returns ok:true with the constructed FEN when the grid is legal", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: {
        board: STARTING_GRID,
        sideToMove: "w",
        castling: "KQkq",
        enPassant: "-",
      },
    });
    const result = await parseScreenshot(VALID_INPUT);
    expect(result).toEqual({
      ok: true,
      data: { fen: STARTING_FEN, sideToMove: "w" },
    });
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on illegal position then succeeds", async () => {
    generateObjectMock
      .mockResolvedValueOnce({
        object: {
          board: ILLEGAL_GRID,
          sideToMove: "w",
          castling: "KQkq",
          enPassant: "-",
        },
      })
      .mockResolvedValueOnce({
        object: {
          board: STARTING_GRID,
          sideToMove: "w",
          castling: "KQkq",
          enPassant: "-",
        },
      });
    const result = await parseScreenshot(VALID_INPUT);
    expect(result.ok).toBe(true);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("returns ok:false illegal_position when retry also fails", async () => {
    generateObjectMock
      .mockResolvedValueOnce({
        object: {
          board: ILLEGAL_GRID,
          sideToMove: "w",
          castling: "KQkq",
          enPassant: "-",
        },
      })
      .mockResolvedValueOnce({
        object: {
          board: ILLEGAL_GRID,
          sideToMove: "w",
          castling: "KQkq",
          enPassant: "-",
        },
      });
    const result = await parseScreenshot(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("illegal_position");
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("returns ok:false invalid_input on a bad input shape", async () => {
    const result = await parseScreenshot({
      imageBase64: "",
      mimeType: "image/png",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_input");
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("returns ok:false vision_error if generateObject throws", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("Gemini outage"));
    const result = await parseScreenshot(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("vision_error");
  });
});
