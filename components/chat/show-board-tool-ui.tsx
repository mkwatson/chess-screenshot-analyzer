"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { Board, type ArrowBrush, type BoardArrow } from "@/lib/chess/board";

// Mirrors ArrowSchema in lib/agent/tools.ts. The tool def is the agent's
// contract; this file conforms to it (not the other way around).
interface ShowBoardArgs {
  readonly fen: string;
  readonly arrows?: readonly {
    readonly from: string;
    readonly to: string;
    readonly color?: ArrowBrush;
  }[];
  readonly caption?: string;
}

// Adapter: agent's {from,to,color} -> chessground's {orig,dest,brush}.
// Default brush is green (best-move convention from the system prompt).
const toBoardArrows = (arrows: ShowBoardArgs["arrows"]): readonly BoardArrow[] =>
  (arrows ?? []).map((a) => ({
    orig: a.from,
    dest: a.to,
    brush: a.color ?? "green",
  }));

// Render-only client tool — no execute, no result handling.
// assistant-ui invokes this inline in the assistant message whenever the
// agent emits a `showBoard` tool call.
export const ShowBoardToolUI = makeAssistantToolUI<ShowBoardArgs, never>({
  toolName: "showBoard",
  render: ({ args }) => (
    <div className="my-2 flex flex-col items-center gap-1">
      <Board fen={args.fen} arrows={toBoardArrows(args.arrows)} />
      {args.caption !== undefined && args.caption !== "" ? (
        <p className="text-muted-foreground text-xs">{args.caption}</p>
      ) : null}
    </div>
  ),
});
