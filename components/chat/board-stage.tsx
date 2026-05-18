"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAuiState } from "@assistant-ui/react";
import { parseFen } from "chessops/fen";
import { ChevronUpIcon, ChevronDownIcon } from "lucide-react";
import { Board, type BoardArrow, type ArrowBrush } from "@/lib/chess/board";
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

// Reads the most-recent `tool-showBoard` part from the active thread's
// assistant messages. Returns args or undefined when nothing to show yet.
// The parseFen guard ensures partial-streaming FENs (which are syntactically
// invalid mid-stream) don't attempt to render — Board silently falls back
// to starting position on invalid input, which hid a real bug in Plan 5.
const findLatestShowBoard = (messages: readonly MessageState[]): ShowBoardArgs | undefined => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg === undefined) continue;
    if (msg.role !== "assistant") continue;
    const content = msg.content;
    for (let j = content.length - 1; j >= 0; j--) {
      const part = content[j];
      if (part === undefined) continue;
      // Narrow the discriminated union to ToolCallMessagePart
      if (part.type !== "tool-call") continue;
      if (part.toolName !== "showBoard") continue;
      // args is ReadonlyJSONObject by default — narrow to ShowBoardArgs
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
  // useAuiState subscribes reactively — re-renders whenever thread.messages
  // changes. `messages` is readonly ThreadMessage[] per @assistant-ui/core's
  // ThreadState type (MessageState extends ThreadMessage, hence the typed
  // narrow in findLatestShowBoard).
  const messages = useAuiState((s) => s.thread.messages);
  const latest = useMemo(() => findLatestShowBoard(messages), [messages]);

  // Auto-expand when the agent renders a NEW position (different FEN from
  // before). Without this, a user who collapsed the strip would miss the
  // next showBoard if the agent kept narrating with the strip closed.
  // Tracks previous FEN in a ref so we don't fire on mount or on re-renders
  // where the FEN is unchanged.
  const prevFenRef = useRef<string | undefined>(latest?.fen);
  useEffect(() => {
    if (latest?.fen !== undefined && latest.fen !== prevFenRef.current) {
      prevFenRef.current = latest.fen;
      onExpandedChange(true);
    }
  }, [latest?.fen, onExpandedChange]);

  if (!latest) return null;

  return (
    <div className="border-border bg-background sticky top-0 z-10 flex flex-col items-center border-b">
      {expanded ? (
        <>
          <div className="flex w-full justify-center px-12 pt-2">
            <Board fen={latest.fen} arrows={toBoardArrows(latest.arrows)} />
          </div>
          {latest.caption !== undefined && latest.caption !== "" ? (
            <p className="text-muted-foreground pb-1 text-xs">{latest.caption}</p>
          ) : null}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center py-1 text-xs"
            onClick={() => onExpandedChange(false)}
            aria-label="Collapse board"
          >
            <ChevronUpIcon className="size-4" />
          </button>
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
