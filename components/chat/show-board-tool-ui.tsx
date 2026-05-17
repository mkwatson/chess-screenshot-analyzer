"use client";

import { makeAssistantTool } from "@assistant-ui/react";
import { z } from "zod";
import { Board, type BoardArrow } from "@/lib/chess/board";
import { FenSchema } from "@/lib/engine/types";

const ArrowSchema = z.object({
  from: z.string().regex(/^[a-h][1-8]$/, "from must be a square like e2"),
  to: z.string().regex(/^[a-h][1-8]$/, "to must be a square like e4"),
  color: z.enum(["green", "red", "blue", "yellow"]).optional(),
});

const ShowBoardArgsSchema = z.object({
  fen: FenSchema,
  arrows: z.array(ArrowSchema).max(8).optional(),
  caption: z.string().max(120).optional(),
});

type ShowBoardArgs = z.infer<typeof ShowBoardArgsSchema>;

// Adapter: agent's {from,to,color} -> chessground's {orig,dest,brush}.
// Default brush is green (best-move convention from the system prompt).
const toBoardArrows = (arrows: ShowBoardArgs["arrows"]): readonly BoardArrow[] =>
  (arrows ?? []).map((a) => ({
    orig: a.from,
    dest: a.to,
    brush: a.color ?? "green",
  }));

// Frontend tool — defined entirely client-side. The transport
// (AssistantChatTransport) auto-injects this tool's schema into the
// /api/chat request body, the server merges it into Gemini's tool palette,
// and assistant-ui's useToolInvocations auto-runs execute + addToolResult
// when the model emits a call. That resolves the tool's message-part
// state to "output-available", flipping the assistant message's
// auto-status from "requires-action" to "complete" — which is the
// precondition for both persistence (useExternalHistory) and the
// composer staying visible.
export const ShowBoardToolUI = makeAssistantTool<ShowBoardArgs, null>({
  toolName: "showBoard",
  type: "frontend",
  description:
    "Render a chess board visually in your message. Use this whenever spatial information is in play — pointing at a square, showing the best move with an arrow, illustrating a tactic. Prefer this over describing positions in prose. Arrows: green = best move, red = blunder, blue/yellow = alternatives.",
  parameters: ShowBoardArgsSchema,
  execute: () => Promise.resolve(null),
  render: ({ args }) => (
    <div className="my-2 flex flex-col items-center gap-1">
      <Board fen={args.fen} arrows={toBoardArrows(args.arrows)} />
      {args.caption !== undefined && args.caption !== "" ? (
        <p className="text-muted-foreground text-xs">{args.caption}</p>
      ) : null}
    </div>
  ),
});
