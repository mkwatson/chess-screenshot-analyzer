import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { analyzePosition as runAnalyzePosition } from "@/lib/engine/stockfish";
import { FenSchema } from "@/lib/engine/types";

const UciMoveSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Invalid UCI move");

const AnalyzePositionArgs = z.object({
  fen: FenSchema,
  candidateMove: UciMoveSchema.optional(),
  depth: z.number().int().min(8).max(22).optional(),
  multiPV: z.number().int().min(1).max(10).optional(),
});

// showBoard / askOnBoard are frontend tools — defined in components/chat/ and
// auto-injected into the request body by AssistantChatTransport. The server
// merges them via wrapBodyTools in app/api/chat/route.ts.
export const tools: ToolSet = {
  analyzePosition: tool({
    description:
      "Run Stockfish on a chess position. Returns the best move (UCI), its evaluation (centipawns, positive = White better) and mate-in-N if applicable, the next-best `alternatives` lines (multiPV - 1 entries, ranked), and optionally a `candidateVerdict` with rank + evalLossCp when you pass `candidateMove`. Levers: `depth` (8-22, default 14 — bump for sharp/tactical/endgame positions), `multiPV` (1-10, default 3 — bump when asking 'what are the candidate moves?' or to confirm there's no equal alternative), `candidateMove` (UCI — when the user has proposed a specific move, pass it to learn rank-in-top-N and evalLoss vs. best). The engine is your private oracle — use the result to inform hints; do NOT paste bestMove into prose unless the user has explicitly asked for the answer.",
    inputSchema: AnalyzePositionArgs,
    execute: async ({ fen, candidateMove, depth, multiPV }) =>
      runAnalyzePosition({
        fen,
        depth: depth ?? 14,
        multiPV: multiPV ?? 3,
        ...(candidateMove !== undefined && { candidateMove }),
      }),
  }),
};
