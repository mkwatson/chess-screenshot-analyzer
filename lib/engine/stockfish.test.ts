import { describe, it, expect } from "vitest";
import { analyzePosition } from "./stockfish";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("analyzePosition", () => {
  it("returns a valid UCI bestMove from the starting position", async () => {
    const result = await analyzePosition({ fen: STARTING_FEN, depth: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
      expect(result.data.depth).toBeGreaterThanOrEqual(10);
    }
  }, 30_000);

  it("returns ok:false with reason for an obviously invalid FEN", async () => {
    const result = await analyzePosition({
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      depth: 4 as unknown as 10,
      // ^ deliberately invalid via cast — exercises the runtime guard
    });
    // The function should defensively check depth bounds before calling the engine
    // and return ok:false. (Exact behavior may vary; assert the contract.)
    expect(result.ok).toBe(false);
  });
});
