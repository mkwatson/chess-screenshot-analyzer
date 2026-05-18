"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAuiState } from "@assistant-ui/react";
import { parseFen } from "chessops/fen";
import { ChevronUpIcon, ChevronDownIcon } from "lucide-react";
import { Board, type BoardArrow, type ArrowBrush } from "@/lib/chess/board";
import { InteractiveBoard } from "@/lib/chess/interactive-board";
import { useAskOnBoard } from "@/lib/chat/ask-on-board-store";
import type { MessageState } from "@assistant-ui/react";

interface ShowBoardArgs {
  readonly fen: string;
  readonly arrows?: readonly {
    readonly from: string;
    readonly to: string;
    readonly color?: ArrowBrush;
  }[];
  readonly caption?: string;
}

interface BoardStageProps {
  readonly expanded: boolean;
  readonly onExpandedChange: (next: boolean) => void;
}

// Walks back through assistant messages for the most-recent `showBoard`
// tool-call. The `parseFen(...).isOk` gate is load-bearing: partial-streaming
// FENs are syntactically invalid mid-stream, and chessground silently falls
// back to the starting position on invalid input — which hid a real bug for
// hours in Plan 5. The gate enforces "only render when we have a valid FEN."
const findLatestShowBoard = (messages: readonly MessageState[]): ShowBoardArgs | undefined => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg === undefined) continue;
    if (msg.role !== "assistant") continue;
    const content = msg.content;
    for (let j = content.length - 1; j >= 0; j--) {
      const part = content[j];
      if (part === undefined) continue;
      if (part.type !== "tool-call") continue;
      if (part.toolName !== "showBoard") continue;
      const args: unknown = part.args;
      if (args === null || typeof args !== "object") continue;
      const a = args as Record<string, unknown>;
      if (typeof a.fen === "string" && parseFen(a.fen).isOk) {
        return args as ShowBoardArgs;
      }
    }
  }
  return undefined;
};

const toBoardArrows = (arrows: ShowBoardArgs["arrows"]): readonly BoardArrow[] =>
  (arrows ?? []).map((a) => ({ orig: a.from, dest: a.to, brush: a.color ?? "green" }));

export function BoardStage({
  expanded,
  onExpandedChange,
}: BoardStageProps): React.JSX.Element | null {
  const messages = useAuiState((s) => s.thread.messages);
  const latest = useMemo(() => findLatestShowBoard(messages), [messages]);
  const pendingAsk = useAskOnBoard();

  // Auto-expand when the agent renders a NEW position (different FEN from
  // before). Without this, a user who had collapsed the strip would miss
  // the next showBoard. The ref tracks previous FEN so we don't fire on
  // mount or on re-renders where the FEN is unchanged.
  const prevFenRef = useRef<string | undefined>(latest?.fen);
  useEffect(() => {
    if (latest?.fen !== undefined && latest.fen !== prevFenRef.current) {
      prevFenRef.current = latest.fen;
      onExpandedChange(true);
    }
  }, [latest?.fen, onExpandedChange]);

  // If askOnBoard is pending, force-expand so the user can interact.
  useEffect(() => {
    if (pendingAsk !== null && !expanded) onExpandedChange(true);
  }, [pendingAsk, expanded, onExpandedChange]);

  // Nothing to show: no prior board AND no pending ask.
  if (latest === undefined && pendingAsk === null) return null;

  return (
    <div className="border-border bg-background sticky top-0 z-10 flex flex-col items-center border-b">
      {expanded ? (
        <>
          <div className="flex w-full justify-center px-12 pt-2">
            {pendingAsk !== null ? (
              <InteractiveBoard
                fen={pendingAsk.args.fen}
                prompt={pendingAsk.args.prompt}
                accept={pendingAsk.args.accept}
                minTotal={pendingAsk.args.minTotal ?? 1}
                maxTotal={pendingAsk.args.maxTotal}
                onSubmit={(result) => pendingAsk.addResult(result)}
              />
            ) : latest !== undefined ? (
              <Board fen={latest.fen} arrows={toBoardArrows(latest.arrows)} />
            ) : null}
          </div>
          {pendingAsk === null && latest?.caption !== undefined && latest.caption !== "" ? (
            <p className="text-muted-foreground pb-1 text-xs">{latest.caption}</p>
          ) : null}
          {pendingAsk === null ? (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center py-1 text-xs"
              onClick={() => onExpandedChange(false)}
              aria-label="Collapse board"
            >
              <ChevronUpIcon className="size-4" />
            </button>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 py-2 text-xs"
          onClick={() => onExpandedChange(true)}
          aria-label="Expand board"
        >
          Position pinned
          <ChevronDownIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
