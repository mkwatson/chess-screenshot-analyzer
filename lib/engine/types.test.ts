import { describe, it, expect } from "vitest";
import { FenSchema, AnalyzeInputSchema, AnalyzeOutputSchema } from "./types";

// Minimal tests: FenSchema delegates to chessops (parseFen + Chess.fromSetup).
// chessops has its own test suite; we don't duplicate. These three tests
// only prove "our .refine() wraps chessops correctly" — nothing more.
describe("FenSchema", () => {
  it("accepts a chessops-legal FEN (starting position)", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(FenSchema.parse(fen)).toBe(fen);
  });

  it("rejects an empty string (Zod .min(1))", () => {
    expect(() => FenSchema.parse("")).toThrow();
  });

  it("rejects an illegal position (chessops .refine())", () => {
    // Syntactically valid but illegal: two white kings.
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBKK w KQkq - 0 1";
    expect(() => FenSchema.parse(fen)).toThrow();
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
