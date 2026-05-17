"use client";

import { useState } from "react";
import { makeAssistantTool } from "@assistant-ui/react";
import { z } from "zod";
import { Button } from "@/components/ui/button";

const ShowOptionsArgsSchema = z.object({
  prompt: z.string().max(200).optional(),
  options: z.array(z.string().min(1).max(80)).min(2).max(6),
});

type ShowOptionsArgs = z.infer<typeof ShowOptionsArgsSchema>;
interface ShowOptionsResult {
  readonly choice: string;
}

// Human tool — no execute. The agent emits a tool-call with the
// options; we render tappable chips; the user's tap fires addResult
// with their choice; runtime auto-resends the conversation
// (sendAutomaticallyWhen wired in chat-surface).
export const ShowOptionsToolUI = makeAssistantTool<ShowOptionsArgs, ShowOptionsResult>({
  toolName: "showOptions",
  type: "human",
  description:
    "Ask the user to pick from 2–6 short options. The user taps a chip and you receive their choice. Use when a one-question disambiguation can save a round-trip of typing — e.g. 'are you playing White or Black?', 'which line do you want to explore?'. Do NOT use for open-ended questions.",
  parameters: ShowOptionsArgsSchema,
  render: (props) => <ShowOptionsChips {...props} />,
});

// Extracted so hooks work cleanly (the render slot wraps this into a
// ComponentType). Local `chosen` state disables the chips synchronously
// on first tap so a fast double-tap can't fire addResult twice before
// the `result` prop propagates back from the runtime.
function ShowOptionsChips({
  args,
  addResult,
  result,
}: {
  readonly args: ShowOptionsArgs;
  readonly addResult: (r: ShowOptionsResult) => void;
  readonly result?: ShowOptionsResult | undefined;
}) {
  const [chosen, setChosen] = useState(false);

  // History replay path: tool already resolved. Show what was chosen
  // so the conversation reads coherently on reload.
  if (result !== undefined) {
    return (
      <div className="my-2 flex flex-wrap items-center gap-2">
        {args.prompt !== undefined && args.prompt !== "" ? (
          <p className="text-muted-foreground text-sm">{args.prompt}</p>
        ) : null}
        <span className="bg-muted rounded-full px-3 py-1 text-sm">
          You chose: <b>{result.choice}</b>
        </span>
      </div>
    );
  }

  return (
    <div className="my-2 flex flex-col gap-2">
      {args.prompt !== undefined && args.prompt !== "" ? (
        <p className="text-sm">{args.prompt}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {args.options.map((opt) => (
          <Button
            key={opt}
            variant="outline"
            size="sm"
            disabled={chosen}
            onClick={() => {
              setChosen(true);
              addResult({ choice: opt });
            }}
          >
            {opt}
          </Button>
        ))}
      </div>
    </div>
  );
}
