# Interactive Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Two interactive frontend tools — `showOptions` (tappable chips) and `editPosition` (editable-board Drawer). User taps/confirms → agent receives the result → conversation continues automatically.

**Architecture:** Both tools use assistant-ui's `type: "human"` tool pattern. No `execute` needed. The render component receives `addResult(result)` as a prop and calls it directly when the user takes action. The runtime is configured with `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` so the agent auto-resumes once the tool resolves.

**Tech Stack:** assistant-ui `makeAssistantTool({ type: "human", parameters, render })` · chessground in `movable: { free: true }` mode for the edit Drawer · shadcn/vaul Drawer (already installed) · existing system-prompt structure with two new tool descriptions.

---

## Scope notes (per principles)

- **`showOptions` MVP:** flat list of string labels. No icons, descriptions, multi-select, or "Other" affordance. Plan 9 can polish.
- **`editPosition` MVP:** drag existing pieces freely on the board + side-to-move toggle + Confirm. **No** palette to add pieces, **no** clear-board, **no** reset-to-start. If a parse miss is "missing piece", user re-uploads a better screenshot. (We can add the palette in Plan 9 when we see how often it's needed.)
- **No confidence signals.** Spec defers this; `editPosition` is triggered by user-words ("the position is wrong", "fix it") interpreted by the agent, not by a per-square confidence metric.
- **No tests.** Plan 10's eval loop is the right home for interactive-tool contract tests. Types + lint + the existing AGENTS.md frontend-tool rule cover the mechanical surface.

## File structure

- Create: `components/chat/show-options-tool-ui.tsx` — `makeAssistantTool` for `showOptions`
- Create: `components/chat/edit-position-tool-ui.tsx` — `makeAssistantTool` for `editPosition` + vaul Drawer + editable Board variant
- Create: `lib/chess/editable-board.tsx` — chessground in `movable: free` mode (small extension of Board)
- Modify: `lib/agent/system-prompt.ts` — teach the agent when to call each
- Modify: `components/chat/chat-surface.tsx` — mount the two new tool components; add `sendAutomaticallyWhen` to `useChessRuntime`
- Modify: `components/assistant-ui/thread.tsx` — `groupBy` already excludes `showBoard`; add `showOptions` and `editPosition` exclusions so they render inline (they're message content, not chain-of-thought)
- Modify: `CLAUDE.md` execution-state → mark Plan 6 SHIPPED

---

## Task 1: `showOptions` tool

**Files:**
- Create: `components/chat/show-options-tool-ui.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { makeAssistantTool } from "@assistant-ui/react";
import { z } from "zod";
import { Button } from "@/components/ui/button";

const ShowOptionsArgsSchema = z.object({
  prompt: z.string().max(200).optional(),
  options: z.array(z.string().min(1).max(80)).min(2).max(6),
});

type ShowOptionsArgs = z.infer<typeof ShowOptionsArgsSchema>;
type ShowOptionsResult = { readonly choice: string };

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
  render: ({ args, addResult, result }) => {
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
    // Active path: render chips.
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
              onClick={() => {
                addResult({ choice: opt });
              }}
            >
              {opt}
            </Button>
          ))}
        </div>
      </div>
    );
  },
});
```

- [ ] **Step 2: Type-check + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: clean. The `Button` component is at `components/ui/button.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/chat/show-options-tool-ui.tsx
git commit -m "feat(chat): showOptions frontend tool — tappable disambiguation chips"
```

---

## Task 2: Editable board variant

**Files:**
- Create: `lib/chess/editable-board.tsx`

Why a new file: the existing `Board` is `viewOnly: true` by default and the configuration for free-drag mode plus tracking the resulting FEN is meaningfully different. Keeping them split avoids cluttering the view-only path.

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import { makeFen, parseFen } from "chessops/fen";
import { Chess } from "chessops/chess";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";

export interface EditableBoardProps {
  readonly fen: string;
  readonly turn: "white" | "black";
  readonly onChange: (fen: string) => void;
}

// Edit-mode board. Drag-from-existing only — no palette in v0
// (see Plan 6 scope notes). chessground's `movable.free=true` allows
// any piece to land on any square; we reconstruct the FEN from the
// API's `getFen()` after each move, then notify the parent via onChange.
export function EditableBoard({ fen, turn, onChange }: EditableBoardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<Api | null>(null);

  // Caller is responsible for passing a chessops-legal FEN
  // (see lib/chess/board.tsx comment for context). If the model emits
  // an illegal one we'd have rejected it upstream in show-options-tool-ui.
  useEffect(() => {
    if (!hostRef.current) return;
    const initialConfig: Config = {
      fen,
      orientation: turn,
      movable: { free: true, color: "both", showDests: false },
      draggable: { enabled: true },
      coordinates: true,
      events: {
        change: () => {
          const api = apiRef.current;
          if (!api) return;
          // chessground's getFen() returns the position fragment only —
          // no side-to-move/castling/en-passant/halfmove/fullmove. We
          // append a minimal-but-valid tail; chessops re-validates downstream.
          const positionOnly = api.getFen();
          // Combine into a full FEN with sensible defaults. Castling rights
          // `KQkq` are common (chessops will reject if e.g. king has moved
          // off home square, but we accept the false-negative here for v0).
          const combined = `${positionOnly} ${turn === "white" ? "w" : "b"} - - 0 1`;
          // Only emit when chessops accepts — otherwise the FEN is mid-edit
          // (e.g. user dragged a piece into limbo for a frame). Caller
          // disables Confirm based on parseability.
          if (parseFen(combined).isOk) onChange(combined);
        },
      },
    };
    const api = Chessground(hostRef.current, initialConfig);
    apiRef.current = api;
    return () => {
      api.destroy();
      apiRef.current = null;
    };
    // Mount once — orientation/fen changes from outside are not expected
    // mid-edit. If the parent wants to reset, it can remount via key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="aspect-square w-full max-w-[min(85vw,420px)]">
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}

// Helper for callers: produce a fresh FEN from an existing one with a
// new side-to-move. Used by the toggle in the edit Drawer.
export const withSideToMove = (fen: string, turn: "white" | "black"): string => {
  const parts = fen.split(" ");
  if (parts.length < 6) return fen;
  parts[1] = turn === "white" ? "w" : "b";
  return parts.join(" ");
};
```

Hmm — the snippet above imports `Chess` from `chessops/chess` but doesn't use it. Remove that import.

- [ ] **Step 2: Type-check + lint**

```bash
pnpm typecheck && pnpm lint
```

If chessground's `Config["events"]["change"]` type differs (the event signature may take no args), adjust.

- [ ] **Step 3: Commit**

```bash
git add lib/chess/editable-board.tsx
git commit -m "feat(chess): EditableBoard — drag-free chessground variant for Plan 6"
```

---

## Task 3: `editPosition` tool

**Files:**
- Create: `components/chat/edit-position-tool-ui.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import { useState } from "react";
import { makeAssistantTool } from "@assistant-ui/react";
import { parseFen } from "chessops/fen";
import { z } from "zod";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { EditableBoard, withSideToMove } from "@/lib/chess/editable-board";
import { FenSchema } from "@/lib/engine/types";

const EditPositionArgsSchema = z.object({
  fen: FenSchema,
});

type EditPositionArgs = z.infer<typeof EditPositionArgsSchema>;
type EditPositionResult = { readonly fen: string };

// Human tool — opens a Drawer with the parsed position. The user drags
// pieces / flips side-to-move and Confirms. Result is the corrected FEN.
export const EditPositionToolUI = makeAssistantTool<EditPositionArgs, EditPositionResult>({
  toolName: "editPosition",
  type: "human",
  description:
    "Open an editable board so the user can correct a parsed position. ONLY call this when the user explicitly says the parsed board is wrong (or asks to edit it). Pass the current best-guess FEN as the starting point; the user adjusts and confirms. You receive the corrected FEN as the result and should redo your analysis with the new position.",
  parameters: EditPositionArgsSchema,
  render: ({ args, addResult, result }) => {
    // History-replay path: tool already resolved.
    if (result !== undefined) {
      return (
        <div className="my-2 text-muted-foreground text-xs">
          User confirmed the corrected position.
        </div>
      );
    }

    return <EditPositionDialog initialFen={args.fen} onConfirm={(fen) => addResult({ fen })} />;
  },
});

// Pulled out so we can use hooks. (makeAssistantTool's render is just a
// function; hooks need a real component for fast-refresh + StrictMode.)
function EditPositionDialog({
  initialFen,
  onConfirm,
}: {
  readonly initialFen: string;
  readonly onConfirm: (fen: string) => void;
}) {
  // The Drawer opens immediately when the tool renders, and stays open
  // until the user Confirms. `open` is controlled so we can dismiss on
  // confirm without unmounting via DrawerClose (which would race the
  // onConfirm call).
  const [open, setOpen] = useState(true);
  const [turn, setTurn] = useState<"white" | "black">(initialFen.split(" ")[1] === "b" ? "black" : "white");
  const [currentFen, setCurrentFen] = useState(initialFen);

  const canConfirm = parseFen(currentFen).isOk;

  const handleConfirm = (): void => {
    setOpen(false);
    onConfirm(currentFen);
  };

  const handleBoardChange = (nextFen: string): void => {
    // EditableBoard emits position+turn; honor the current `turn` state
    // (board's events don't know about toggle state).
    setCurrentFen(withSideToMove(nextFen, turn));
  };

  const handleTurnToggle = (next: "white" | "black"): void => {
    setTurn(next);
    setCurrentFen(withSideToMove(currentFen, next));
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit position</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col items-center gap-4 px-4">
          <EditableBoard fen={initialFen} turn={turn} onChange={handleBoardChange} />
          <div className="flex gap-2">
            <Button
              variant={turn === "white" ? "default" : "outline"}
              size="sm"
              onClick={() => handleTurnToggle("white")}
            >
              White to move
            </Button>
            <Button
              variant={turn === "black" ? "default" : "outline"}
              size="sm"
              onClick={() => handleTurnToggle("black")}
            >
              Black to move
            </Button>
          </div>
        </div>
        <DrawerFooter>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Confirm
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
```

- [ ] **Step 2: Type-check + lint + format**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

If the generated shadcn `Drawer` doesn't export `DrawerFooter`, check `components/ui/drawer.tsx` for the exact set and adjust.

- [ ] **Step 3: Commit**

```bash
git add components/chat/edit-position-tool-ui.tsx
git commit -m "feat(chat): editPosition frontend tool — Drawer with editable board"
```

---

## Task 4: Update Thread groupBy

**Files:**
- Modify: `components/assistant-ui/thread.tsx`

The existing groupBy excludes `showBoard` from the collapsed chain-of-thought wrapper. Both new tools are visible content (chips / Drawer) — same treatment.

- [ ] **Step 1: Edit the groupBy**

In `thread.tsx`, locate the `MessagePrimitive.GroupedParts` `groupBy` callback (it currently has the `showBoard` exclusion). Add two more checks:

```tsx
groupBy={(part) => {
  if (part.type === "reasoning") return ["group-chainOfThought", "group-reasoning"];
  if (part.type === "tool-call") {
    if (getMcpAppFromToolPart(part)) return null;
    // Visible client tools render inline as message content, not as
    // chain-of-thought. Engine calls (analyzePosition) stay collapsed.
    if (part.toolName === "showBoard") return null;
    if (part.toolName === "showOptions") return null;
    if (part.toolName === "editPosition") return null;
    return ["group-chainOfThought", "group-tool"];
  }
  return null;
}}
```

- [ ] **Step 2: Pipeline + commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
git add components/assistant-ui/thread.tsx
git commit -m "fix(chat): render showOptions/editPosition inline like showBoard"
```

---

## Task 5: System prompt update

**Files:**
- Modify: `lib/agent/system-prompt.ts`

- [ ] **Step 1: Add tool guidance for the two new tools**

In the `# Tool guidance` section, add entries after `showBoard`:

```
- showOptions({ prompt?, options }) — Render 2–6 tappable choice chips when a one-question disambiguation saves typing. Examples: "Are you playing as White or Black?", "Want to see the line for dxc6 or Nxc6?". DO NOT use for open-ended questions.
- editPosition({ fen }) — Open an editable board so the user can correct a parsed position. ONLY call when the user explicitly indicates the position is wrong, asks to fix it, or otherwise signals a vision-parse error. Pass your current best FEN as the starting point. After the user confirms, you receive the corrected FEN as the result — redo your analysis with the new position.
```

And in `# Hard rules`, add:

```
- NEVER call editPosition unless the user has explicitly indicated the parsed position is wrong. Don't volunteer it.
- NEVER call showOptions for open-ended questions — only when 2–6 short choices are genuinely sufficient.
```

- [ ] **Step 2: Commit**

```bash
git add lib/agent/system-prompt.ts
git commit -m "feat(agent): teach system prompt about showOptions + editPosition"
```

---

## Task 6: Wire tools + sendAutomaticallyWhen

**Files:**
- Modify: `components/chat/chat-surface.tsx`

- [ ] **Step 1: Add the two tool mounts + auto-resume**

Imports:

```tsx
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { EditPositionToolUI } from "./edit-position-tool-ui";
import { ShowOptionsToolUI } from "./show-options-tool-ui";
```

Mount the two new tool components alongside `<ShowBoardToolUI />` inside `<AssistantRuntimeProvider>`.

Update the runtime hook to opt into auto-resume after interactive tool resolution:

```tsx
const useChessRuntime = () =>
  useChatRuntime({
    adapters: { attachments: attachmentAdapter },
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });
```

If `lastAssistantMessageIsCompleteWithToolCalls` isn't exported directly from `ai`, check the actual export location — it may be under `@ai-sdk/react` or similar. As of AI SDK v6 it's exported from `ai`. Grep `node_modules/ai/dist/index.d.ts` for the name to confirm.

- [ ] **Step 2: Pipeline + commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
git add components/chat/chat-surface.tsx
git commit -m "feat(chat): mount showOptions + editPosition tools; auto-resume after tool result"
```

---

## Task 7: Local smoke

**Files:** none

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Browser checks**

Open `http://localhost:3000` (use a fresh isolated context if testing in Chrome DevTools so Dexie is clean).

**showOptions:**
1. Send a message that's likely to elicit a disambiguation, e.g. "I'm new to chess — what should I learn first?" The agent should call `showOptions` with 2–4 choices (openings, endings, tactics, etc.).
2. Tap a chip. The chip should turn into a "You chose: X" badge.
3. The agent should auto-resume and reply incorporating your choice.
4. Refresh. The "You chose: X" badge should reload from Dexie (history-replay path of the render).

**editPosition:**
1. Upload a chess screenshot.
2. After the initial analysis, send "actually the position is wrong, can you let me fix it?"
3. The agent should call `editPosition` with the parsed FEN. A Drawer opens with the board.
4. Drag a piece. Confirm.
5. The Drawer closes. The agent auto-resumes and analyzes the corrected FEN.
6. Refresh. The replay path should show "User confirmed the corrected position." instead of reopening the Drawer.

If anything is broken, fix locally and commit with `fix(chat): ...`.

- [ ] **Step 3: Stop dev server**

---

## Task 8: Deploy + prod smoke

**Files:** none

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Wait for Vercel ready**

```bash
until vercel ls chess-screenshot-analyzer --prod 2>&1 | head -4 | tail -1 | grep -q "● Ready"; do sleep 10; done
```

- [ ] **Step 3: HTTP smoke**

```bash
PROD="https://chess-screenshot-analyzer-two.vercel.app"
curl -sI "$PROD/" | head -1
```

Expected: 200.

- [ ] **Step 4: iPhone test (Mark)**

Open the production URL. Try the showOptions flow and the editPosition flow on a real phone. Confirm chips/Drawer behave correctly with touch + safe-area-inset.

---

## Task 9: Close out — CLAUDE.md + final commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the Plan 6 execution-state line**

```
- **Plan 6 (interactive tools) — SHIPPED.** Two human tools (`showOptions`, `editPosition`) using assistant-ui's `type: "human"` pattern — no `execute`, render component calls `addResult` directly. `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` on the runtime means the agent auto-resumes after a tool resolves. `editPosition` uses chessground's `movable.free` mode in a vaul Drawer (drag-existing-pieces only in v0; piece palette deferred to Plan 9). `groupBy` in `thread.tsx` excludes both new tools from the chain-of-thought wrapper (same treatment as `showBoard`).
- **Next plan:** Slice 7 — PWA finalize. Plan document not yet written.
```

- [ ] **Step 2: Commit + push**

```bash
git add CLAUDE.md
git commit -m "docs: mark Plan 6 complete; resume marker → Slice 7"
git push origin main
```

---

## Done

End state:
- Agent can ask the user to pick from 2–6 chip options; the user's tap drives the conversation forward without typing.
- Agent can ask the user to correct a vision-parse error via an editable board; the corrected FEN feeds back into the agent's analysis.
- Both tools persist their resolved state correctly (history replay shows what was chosen / confirmed).
- The pattern is now well-trodden: any future "user-resolves-this" tool just needs `makeAssistantTool({ type: "human", parameters, render })` with `addResult` in the render.
