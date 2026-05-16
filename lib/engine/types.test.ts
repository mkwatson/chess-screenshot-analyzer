import { describe, it, expect } from "vitest";
import { FenSchema, AnalyzeInputSchema, AnalyzeOutputSchema } from "./types";

describe("FenSchema", () => {
  it("accepts the starting position FEN", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(FenSchema.parse(fen)).toBe(fen);
  });

  it("accepts a mid-game FEN", () => {
    const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
    expect(FenSchema.parse(fen)).toBe(fen);
  });

  it("rejects a non-FEN string", () => {
    expect(() => FenSchema.parse("hello world")).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => FenSchema.parse("")).toThrow();
  });

  it("rejects an FEN with wrong side-to-move marker", () => {
    expect(() =>
      FenSchema.parse("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1"),
    ).toThrow();
  });
});

describe("AnalyzeInputSchema", () => {
  it("accepts { fen, depth }", () => {
    const input = {
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      depth: 14,
    };
    expect(AnalyzeInputSchema.parse(input)).toEqual(input);
  });

  it("defaults depth to 14 when omitted", () => {
    const parsed = AnalyzeInputSchema.parse({
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    });
    expect(parsed.depth).toBe(14);
  });

  it("rejects depth > 22", () => {
    expect(() =>
      AnalyzeInputSchema.parse({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        depth: 50,
      }),
    ).toThrow();
  });

  it("rejects depth < 8", () => {
    expect(() =>
      AnalyzeInputSchema.parse({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        depth: 4,
      }),
    ).toThrow();
  });
});

describe("AnalyzeOutputSchema", () => {
  it("accepts a success result with bestMove + eval", () => {
    const result = {
      ok: true as const,
      data: {
        bestMove: "e2e4",
        evalCp: 25,
        depth: 14,
      },
    };
    expect(AnalyzeOutputSchema.parse(result)).toEqual(result);
  });

  it("accepts a failure result with reason", () => {
    const result = {
      ok: false as const,
      reason: "engine_timeout" as const,
    };
    expect(AnalyzeOutputSchema.parse(result)).toEqual(result);
  });

  it("rejects a result missing the discriminator", () => {
    expect(() => AnalyzeOutputSchema.parse({ bestMove: "e2e4" })).toThrow();
  });
});
