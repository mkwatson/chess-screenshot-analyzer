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

const ArrowSchema = z.object({
  from: z.string().regex(/^[a-h][1-8]$/, "from must be a square like e2"),
  to: z.string().regex(/^[a-h][1-8]$/, "to must be a square like e4"),
  color: z.enum(["green", "red", "blue", "yellow"]).optional(),
});

const ShowBoardArgs = z.object({
  fen: FenSchema,
  arrows: z.array(ArrowSchema).max(8).optional(),
  caption: z.string().max(120).optional(),
});

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
  showBoard: tool({
    description:
      "Render a chess board visually in your message. Use this whenever spatial information is in play — pointing at a square, showing the best move with an arrow, illustrating a tactic. Prefer this over describing positions in prose. Arrows: green = best move, red = blunder, blue/yellow = alternatives.",
    inputSchema: ShowBoardArgs,
    // No execute — render-only client tool. assistant-ui's makeAssistantToolUI
    // renders it via components/chat/show-board-tool-ui.tsx (Task 5).
  }),
};
