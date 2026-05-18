"use client";

import { makeAssistantTool } from "@assistant-ui/react";
import { z } from "zod";
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

// Frontend tool — defined entirely client-side. The transport
// (AssistantChatTransport) auto-injects this tool's schema into the
// /api/chat request body, the server merges it into Gemini's tool palette,
// and assistant-ui's useToolInvocations auto-runs execute + addToolResult
// when the model emits a call. That resolves the tool's message-part
// state to "output-available", flipping the assistant message's
// auto-status from "requires-action" to "complete" — which is the
// precondition for both persistence (useExternalHistory) and the
// composer staying visible.
//
// render returns null: BoardStage (pinned at the top of the viewport) owns
// the visual display now. This avoids double-rendering the board inline in
// the chat message AND in the sticky header.
export const ShowBoardToolUI = makeAssistantTool({
  toolName: "showBoard",
  type: "frontend",
  description:
    "Render a chess board visually in your message. Use this whenever spatial information is in play — pointing at a square, showing the best move with an arrow, illustrating a tactic. Prefer this over describing positions in prose. Arrows: green = best move, red = blunder, blue/yellow = alternatives.",
  parameters: ShowBoardArgsSchema,
  execute: () => Promise.resolve(null),
  render: () => null,
});
