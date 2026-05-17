import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { analyzePosition as runAnalyzePosition } from "@/lib/engine/stockfish";
import { FenSchema } from "@/lib/engine/types";

const UciMoveSchema = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Invalid UCI move");

const AnalyzePositionArgs = z.object({
  fen: FenSchema,
  candidateMove: UciMoveSchema.optional(),
  depth: z.number().int().min(8).max(22).optional(),
});

// showBoard is a frontend tool — defined in components/chat/show-board-tool-ui.tsx
// and auto-injected into the request body by AssistantChatTransport. The server
// merges it via wrapBodyTools in app/api/chat/route.ts.
export const tools: ToolSet = {
  analyzePosition: tool({
    description:
      "Run Stockfish on a chess position. Returns the engine's best move (UCI), evaluation (centipawns, positive = White better), depth reached, and optionally a candidate-move verdict. Call this whenever you need to know what's best in a position, evaluate a specific move, or claim a position is winning/losing.",
    inputSchema: AnalyzePositionArgs,
    execute: async ({ fen, candidateMove, depth }) =>
      runAnalyzePosition({
        fen,
        depth: depth ?? 14,
        ...(candidateMove !== undefined && { candidateMove }),
      }),
  }),
};
