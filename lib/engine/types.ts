import { z } from "zod";

// FEN regex: piece placement / side / castling / en passant / halfmove / fullmove
// (lenient — we rely on chessops in Stockfish wrapper for strict legality)
const FEN_REGEX = /^[1-8pnbrqkPNBRQK/]+ [wb] (-|[KQkqA-Ha-h]+) (-|[a-h][36]) \d+ \d+$/;

export const FenSchema = z.string().min(1).regex(FEN_REGEX, { message: "Invalid FEN" });
export type Fen = z.infer<typeof FenSchema>;

export const AnalyzeInputSchema = z.object({
  fen: FenSchema,
  depth: z.number().int().min(8).max(22).default(14),
});
export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;

const AnalyzeSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    bestMove: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Invalid UCI move"),
    evalCp: z.number().int().nullable(),
    mate: z.number().int().nullable().optional(),
    depth: z.number().int(),
  }),
});

const AnalyzeFailureSchema = z.object({
  ok: z.literal(false),
  reason: z.enum(["engine_timeout", "invalid_position", "engine_error"]),
  detail: z.string().optional(),
});

export const AnalyzeOutputSchema = z.discriminatedUnion("ok", [
  AnalyzeSuccessSchema,
  AnalyzeFailureSchema,
]);
export type AnalyzeOutput = z.infer<typeof AnalyzeOutputSchema>;
