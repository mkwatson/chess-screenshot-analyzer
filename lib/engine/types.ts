import { z } from "zod";
import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";

// FEN validity = whatever chessops accepts (parseFen + Chess.fromSetup).
// Chessops is our single source of truth for chess validity across the app
// (also used in lib/vision/parse-screenshot.ts). Do not add a parallel regex
// here — it would drift from chessops and we've already been bitten by that.
// See AGENTS.md "chessops is the only FEN validator".
export const FenSchema = z
  .string()
  .min(1)
  .refine(
    (fen) => {
      const parsed = parseFen(fen);
      if (parsed.isErr) return false;
      return Chess.fromSetup(parsed.value).isOk;
    },
    { message: "Invalid FEN (chessops rejected)" },
  );
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
