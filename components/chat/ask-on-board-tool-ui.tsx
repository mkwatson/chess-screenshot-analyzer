"use client";

import { useEffect } from "react";
import { makeAssistantTool } from "@assistant-ui/react";
import {
  AskOnBoardArgsSchema,
  type AskOnBoardArgs,
  type AskOnBoardResult,
} from "@/lib/agent/ask-on-board-types";
import { setPendingAsk } from "@/lib/chat/ask-on-board-store";

// Human tool — no execute. When the agent emits a tool-call, render mounts
// the coordinator below, which pushes (args, addResult) into the pending
// store. BoardStage subscribes and renders InteractiveBoard. When the user
// hits Done, BoardStage calls addResult — runtime auto-resends the
// conversation (sendAutomaticallyWhen wired in chat-surface).
export const AskOnBoardToolUI = makeAssistantTool<AskOnBoardArgs, AskOnBoardResult>({
  toolName: "askOnBoard",
  type: "human",
  description:
    "Ask the user to mark up the position. The board becomes interactive: tap to select pieces or squares, drag a piece for a legal move, right-drag to draw an arrow. Pass `accept` to choose what's collected: 'piece' (highlights pieces tapped), 'square' (highlights empty squares tapped), 'move' (a legal move via drag), 'arrow' (drawn with right-drag). Combine modes for compound questions ('mark the attackers AND show their threats' → accept: ['piece', 'arrow']). Use `minTotal` / `maxTotal` to gate the Done button. Examples: ['move'] for 'What would you play?', ['piece'] for 'Which pieces attack f7?', ['arrow'] for 'Show me Black's threats.'",
  parameters: AskOnBoardArgsSchema,
  render: ({ args, addResult, result }) => (
    <AskOnBoardCoordinator args={args} addResult={addResult} result={result} />
  ),
});

// Coordinator: pushes the pending ask to the module-level store on mount,
// clears on unmount. Returns null so nothing renders inline — BoardStage
// owns the visual. Replay path (result !== undefined): render a small
// "answered" badge so the message reads coherently on reload.
function AskOnBoardCoordinator({
  args,
  addResult,
  result,
}: {
  readonly args: AskOnBoardArgs;
  readonly addResult: (r: AskOnBoardResult) => void;
  readonly result?: AskOnBoardResult | undefined;
}): React.JSX.Element | null {
  useEffect(() => {
    if (result !== undefined) return;
    setPendingAsk({ args, addResult });
    return () => {
      setPendingAsk(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tool-call lifetime == component lifetime; args/addResult identity changes per render but values are stable. With these in deps the effect would re-run every render and flash the store through null, unmounting BoardStage's InteractiveBoard and wiping mid-selection state.
  }, []);

  if (result === undefined) return null;

  const count =
    result.pieces.length + result.squares.length + result.arrows.length + result.moves.length;
  return (
    <div className="text-muted-foreground my-2 text-xs">
      Answered with {count} mark{count === 1 ? "" : "s"}.
    </div>
  );
}
