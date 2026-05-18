# Coaching Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot the agent from "answer-machine" to "coach": confirm turn, ask the user what they see, hint progressively, withhold the best move until explicitly asked. Make this possible by adding `askOnBoard` — a multi-mode interactive board tool the agent can use to ask the user to identify pieces, squares, arrows, and/or moves in a single turn.

**Architecture:** One generic frontend tool (`askOnBoard`, type `"human"`) parameterised by an `accept` array of selection modes. The tool's UI hijacks the existing `BoardStage` (no second board on screen) — chessground supports tap, drag-move, and right-drag-arrow simultaneously, so all four modes coexist natively. Tool-call coordination uses a module-level `useSyncExternalStore` (no provider/context plumbing). The system prompt is rewritten to coach-first behaviour with new worked examples.

**Tech Stack:** AI SDK v6 + Gemini 3.1 Flash Lite · assistant-ui `makeAssistantTool({ type: "human" })` · chessground `events.select` / `events.move` / `drawable.onChange` · chessops for legal-move computation · Zod for boundary schemas · React 19 `useSyncExternalStore`.

---

## File structure

**Create:**
- `lib/agent/ask-on-board-types.ts` — Zod schemas + TS types for `AskOnBoardArgs` / `AskOnBoardResult` / annotation pieces. Single source of truth used by the tool UI, the interactive board, and the store.
- `lib/chat/ask-on-board-store.ts` — module-level pending-ask state with a `useSyncExternalStore` hook. Decouples WHO owns the tool resolution (`AskOnBoardToolUI`) from WHERE the UI renders (`BoardStage`).
- `lib/chess/interactive-board.tsx` — chessground wrapper in multi-mode capture. Tracks local annotation state, surfaces a `done` button gated by `minTotal`.
- `components/chat/ask-on-board-tool-ui.tsx` — `makeAssistantTool({ type: "human" })` registration. Render mounts a tiny coordinator that pushes `{ args, addResult }` into the store.

**Modify:**
- `lib/agent/system-prompt.ts` — full rewrite to coach-first behaviour.
- `components/chat/board-stage.tsx` — read pending-ask from the store; render `<InteractiveBoard>` when set, fall back to the static `<Board>` otherwise.
- `components/chat/chat-surface.tsx` — mount `<AskOnBoardToolUI />` alongside the other human tools.
- `components/assistant-ui/thread.tsx` — exclude `askOnBoard` from the chain-of-thought `groupBy` (same treatment as `showBoard` / `showOptions` / `editPosition`).

---

## Task 1: Define askOnBoard schemas and types

**Files:**
- Create: `lib/agent/ask-on-board-types.ts`

- [ ] **Step 1: Write the schema file**

```ts
// lib/agent/ask-on-board-types.ts
import { z } from "zod";
import { FenSchema } from "@/lib/engine/types";

const SquareSchema = z.string().regex(/^[a-h][1-8]$/, "must be a square like e4");

const ArrowBrushSchema = z.enum(["green", "red", "blue", "yellow"]);

const ArrowSchema = z.object({
  from: SquareSchema,
  to: SquareSchema,
  color: ArrowBrushSchema.optional(),
});

const MoveSchema = z.object({
  from: SquareSchema,
  to: SquareSchema,
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
});

const AcceptModeSchema = z.enum(["piece", "square", "arrow", "move"]);

const HintSchema = z.union([SquareSchema, ArrowSchema]);

export const AskOnBoardArgsSchema = z.object({
  fen: FenSchema,
  prompt: z.string().min(1).max(200),
  accept: z.array(AcceptModeSchema).min(1).max(4),
  minTotal: z.number().int().min(1).max(16).optional(),
  maxTotal: z.number().int().min(1).max(16).optional(),
  hint: z.array(HintSchema).max(16).optional(),
});

export const AskOnBoardResultSchema = z.object({
  pieces: z.array(SquareSchema),
  squares: z.array(SquareSchema),
  arrows: z.array(ArrowSchema),
  moves: z.array(MoveSchema),
});

export type AskOnBoardArgs = z.infer<typeof AskOnBoardArgsSchema>;
export type AskOnBoardResult = z.infer<typeof AskOnBoardResultSchema>;
export type AcceptMode = z.infer<typeof AcceptModeSchema>;
export type AnnotationArrow = z.infer<typeof ArrowSchema>;
export type AnnotationMove = z.infer<typeof MoveSchema>;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/agent/ask-on-board-types.ts
git commit -m "feat(askOnBoard): zod schemas + types for multi-mode board ask"
```

---

## Task 2: Add askOnBoard pending store

**Files:**
- Create: `lib/chat/ask-on-board-store.ts`

- [ ] **Step 1: Write the store**

```ts
// lib/chat/ask-on-board-store.ts
"use client";

import { useSyncExternalStore } from "react";
import type { AskOnBoardArgs, AskOnBoardResult } from "@/lib/agent/ask-on-board-types";

// Module-level state — there is exactly one pending askOnBoard at a time
// (the agent loop pauses after a human-tool call). React's
// useSyncExternalStore handles re-renders.

export interface PendingAsk {
  readonly args: AskOnBoardArgs;
  readonly addResult: (result: AskOnBoardResult) => void;
}

let pending: PendingAsk | null = null;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const getSnapshot = (): PendingAsk | null => pending;

const getServerSnapshot = (): PendingAsk | null => null;

export const useAskOnBoard = (): PendingAsk | null =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

export const setPendingAsk = (next: PendingAsk | null): void => {
  pending = next;
  listeners.forEach((l) => {
    l();
  });
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/chat/ask-on-board-store.ts
git commit -m "feat(askOnBoard): pending-ask store (useSyncExternalStore)"
```

---

## Task 3: InteractiveBoard component

**Files:**
- Create: `lib/chess/interactive-board.tsx`

- [ ] **Step 1: Write the component**

```tsx
// lib/chess/interactive-board.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { DrawShape } from "chessground/draw";
import type { Key } from "chessground/types";
import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";
import { chessgroundDests } from "chessops/compat";
import { Button } from "@/components/ui/button";
import type {
  AcceptMode,
  AnnotationArrow,
  AnnotationMove,
  AskOnBoardResult,
} from "@/lib/agent/ask-on-board-types";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";

export interface InteractiveBoardProps {
  readonly fen: string;
  readonly prompt: string;
  readonly accept: ReadonlyArray<AcceptMode>;
  readonly minTotal: number;
  readonly maxTotal: number | undefined;
  readonly onSubmit: (result: AskOnBoardResult) => void;
}

interface AnnotationState {
  readonly pieces: ReadonlySet<string>;
  readonly squares: ReadonlySet<string>;
  readonly arrows: ReadonlyArray<AnnotationArrow>;
  readonly moves: ReadonlyArray<AnnotationMove>;
}

const EMPTY: AnnotationState = {
  pieces: new Set(),
  squares: new Set(),
  arrows: [],
  moves: [],
};

const totalCount = (a: AnnotationState): number =>
  a.pieces.size + a.squares.size + a.arrows.length + a.moves.length;

const toggle = (set: ReadonlySet<string>, key: string): ReadonlySet<string> => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

// Build chessground autoShapes that visualise our local annotation state.
// Pieces → green circle. Squares → blue circle. (Arrows live in chessground's
// own drawable.shapes, so we don't duplicate them as autoShapes.)
const toAutoShapes = (a: AnnotationState): DrawShape[] => [
  ...Array.from(a.pieces).map((sq): DrawShape => ({ orig: sq as Key, brush: "green" })),
  ...Array.from(a.squares).map((sq): DrawShape => ({ orig: sq as Key, brush: "blue" })),
];

export function InteractiveBoard({
  fen,
  prompt,
  accept,
  minTotal,
  maxTotal,
  onSubmit,
}: InteractiveBoardProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<Api | null>(null);
  const [state, setState] = useState<AnnotationState>(EMPTY);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Compute legal destinations once (FEN doesn't change inside one ask).
  const { turn, dests } = useMemo(() => {
    const setup = parseFen(fen).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();
    return {
      turn: pos.turn,
      dests: chessgroundDests(pos),
    };
  }, [fen]);

  const acceptSet = useMemo(() => new Set(accept), [accept]);
  const movesEnabled = acceptSet.has("move");
  const arrowsEnabled = acceptSet.has("arrow");
  const piecesEnabled = acceptSet.has("piece");
  const squaresEnabled = acceptSet.has("square");

  // Mount-once: instantiate chessground. Subsequent prop changes update
  // autoShapes via the reconciliation effect below.
  useEffect(() => {
    if (!hostRef.current) return;
    const initialConfig: Config = {
      fen,
      orientation: turn === "white" ? "white" : "black",
      coordinates: false,
      viewOnly: false,
      selectable: { enabled: false },
      movable: movesEnabled
        ? {
            free: false,
            color: turn,
            dests,
            showDests: true,
          }
        : { free: false, color: undefined, dests: new Map(), showDests: false },
      draggable: { enabled: movesEnabled },
      drawable: { enabled: arrowsEnabled, visible: true },
      events: {
        select: (key) => {
          if (!piecesEnabled && !squaresEnabled) return;
          const api = apiRef.current;
          if (!api) return;
          const piece = api.state.pieces.get(key);
          const next = piece
            ? piecesEnabled
              ? { ...stateRef.current, pieces: toggle(stateRef.current.pieces, key) }
              : null
            : squaresEnabled
              ? { ...stateRef.current, squares: toggle(stateRef.current.squares, key) }
              : null;
          if (next === null) return;
          if (maxTotal !== undefined && totalCount(next) > maxTotal) return;
          setState(next);
        },
        move: movesEnabled
          ? (orig, dest) => {
              const next = {
                ...stateRef.current,
                moves: [...stateRef.current.moves, { from: orig, to: dest }],
              };
              if (maxTotal !== undefined && totalCount(next) > maxTotal) return;
              setState(next);
            }
          : undefined,
      },
    };
    if (arrowsEnabled) {
      initialConfig.drawable!.onChange = (shapes) => {
        // Keep only "real" arrows (orig !== dest); chessground also emits
        // single-square circles when the user right-taps, which we ignore.
        const arrows = shapes
          .filter((s): s is DrawShape & { dest: Key } => s.dest !== undefined && s.dest !== s.orig)
          .map((s): AnnotationArrow => {
            const arrow: AnnotationArrow = { from: s.orig, to: s.dest };
            if (s.brush === "green" || s.brush === "red" || s.brush === "blue" || s.brush === "yellow") {
              return { ...arrow, color: s.brush };
            }
            return arrow;
          });
        const next = { ...stateRef.current, arrows };
        if (maxTotal !== undefined && totalCount(next) > maxTotal) return;
        setState(next);
      };
    }
    const api = Chessground(hostRef.current, initialConfig);
    apiRef.current = api;
    return () => {
      api.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; chessground reconciles via api.set
  }, []);

  // Reconcile autoShapes when state changes (pieces / squares).
  useEffect(() => {
    apiRef.current?.setAutoShapes(toAutoShapes(state));
  }, [state]);

  const count = totalCount(state);
  const canSubmit = count >= minTotal;

  const handleSubmit = (): void => {
    onSubmit({
      pieces: Array.from(state.pieces),
      squares: Array.from(state.squares),
      arrows: state.arrows,
      moves: state.moves,
    });
  };

  const handleClear = (): void => {
    setState(EMPTY);
    apiRef.current?.setShapes([]);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm">{prompt}</p>
      <div className="aspect-square w-full max-w-[min(85vw,420px,45dvh)]">
        <div ref={hostRef} className="h-full w-full touch-none" />
      </div>
      <div className="text-muted-foreground text-xs">
        {count}
        {maxTotal !== undefined ? `/${maxTotal}` : ""} selected
        {count < minTotal ? ` (need ${minTotal})` : ""}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleClear} disabled={count === 0}>
          Clear
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          Done
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. If `chessgroundDests` import path fails, fall back to `import { chessgroundDests } from "chessops/compat"` (already correct above; chessops ships this in its compat module).

- [ ] **Step 3: Commit**

```bash
git add lib/chess/interactive-board.tsx
git commit -m "feat(askOnBoard): InteractiveBoard with multi-mode chessground capture"
```

---

## Task 4: AskOnBoardToolUI registration

**Files:**
- Create: `components/chat/ask-on-board-tool-ui.tsx`

- [ ] **Step 1: Write the tool UI**

```tsx
// components/chat/ask-on-board-tool-ui.tsx
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
  render: ({ args, addResult, result }) => <AskOnBoardCoordinator args={args} addResult={addResult} result={result} />,
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
  }, [args, addResult, result]);

  if (result === undefined) return null;

  const count =
    result.pieces.length + result.squares.length + result.arrows.length + result.moves.length;
  return (
    <div className="text-muted-foreground my-2 text-xs">
      Answered with {count} mark{count === 1 ? "" : "s"}.
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/chat/ask-on-board-tool-ui.tsx
git commit -m "feat(askOnBoard): tool UI registration + pending coordinator"
```

---

## Task 5: Extend BoardStage to render InteractiveBoard when pending

**Files:**
- Modify: `components/chat/board-stage.tsx`

- [ ] **Step 1: Read the current file**

Run: `cat components/chat/board-stage.tsx`
Note the current structure — `findLatestShowBoard` walks messages, returns `{ fen, arrows, caption } | undefined`; the component renders `<Board>` when `latest` is set, else returns null.

- [ ] **Step 2: Replace the file with the extended version**

```tsx
// components/chat/board-stage.tsx
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

  // Auto-expand on new FEN (unchanged from Plan 9).
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
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/chat/board-stage.tsx
git commit -m "feat(askOnBoard): BoardStage renders InteractiveBoard when ask pending"
```

---

## Task 6: Wire AskOnBoardToolUI at app root + groupBy exclusion

**Files:**
- Modify: `components/chat/chat-surface.tsx` — add the tool UI mount.
- Modify: `components/assistant-ui/thread.tsx:269` — extend the groupBy exclusion.

- [ ] **Step 1: Add the import + mount in chat-surface.tsx**

Locate the existing block (around line 14-18):

```tsx
import { ShowBoardToolUI } from "./show-board-tool-ui";
import { ShowOptionsToolUI } from "./show-options-tool-ui";
```

Add the new import alongside:

```tsx
import { AskOnBoardToolUI } from "./ask-on-board-tool-ui";
```

Locate the JSX block where the human tools are mounted (around line 76-78):

```tsx
<ShowBoardToolUI />
<ShowOptionsToolUI />
<EditPositionToolUI />
```

Add the new mount:

```tsx
<ShowBoardToolUI />
<ShowOptionsToolUI />
<EditPositionToolUI />
<AskOnBoardToolUI />
```

- [ ] **Step 2: Extend groupBy in thread.tsx**

Locate the block (around line 267-270 in `components/assistant-ui/thread.tsx`):

```tsx
if (part.toolName === "showBoard") return null;
if (part.toolName === "showOptions") return null;
if (part.toolName === "editPosition") return null;
if (part.toolName === "analyzePosition") return null;
```

Add the new exclusion:

```tsx
if (part.toolName === "showBoard") return null;
if (part.toolName === "showOptions") return null;
if (part.toolName === "editPosition") return null;
if (part.toolName === "askOnBoard") return null;
if (part.toolName === "analyzePosition") return null;
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: both succeed. Build surfaces any next/font + bundle issues that typecheck misses.

- [ ] **Step 4: Commit**

```bash
git add components/chat/chat-surface.tsx components/assistant-ui/thread.tsx
git commit -m "feat(askOnBoard): mount tool UI at app root; exclude from CoT group"
```

---

## Task 7: Coach-first system prompt rewrite

**Files:**
- Modify: `lib/agent/system-prompt.ts` — full rewrite.

- [ ] **Step 1: Replace the file**

```ts
// lib/agent/system-prompt.ts
// Coach system prompt. 8-section structure per spec Section 4.4.
// Pure data — testable by reading; no logic to unit-test.
//
// When iterating (Plan 10's eval loop), edit the sections below; do NOT
// scatter coaching guidance across multiple files or inject extra prompts
// from tool definitions. The prompt is the agent's source of truth.

export const SYSTEM_PROMPT = `# Identity
You are a chess coach who teaches by asking, not by telling. Your job is to help the user FIND the move and understand WHY — not to hand them the answer. Helpful > friendly > sycophantic. Corrections happen because you respect the user; praise is earned.

# Hard rules
- NEVER reveal the best move on the first turn after a position is shared. Confirm context, invite the user's thinking, hint progressively. Reveal the engine line only when the user explicitly asks ("just tell me", "what's best", "give up") OR after two unsuccessful hint rounds.
- NEVER evaluate a move's quality, claim a position is winning, or suggest a specific move without first calling analyzePosition. The engine is your private oracle — it informs your hints, but DO NOT paste the engine's output as the answer.
- NEVER invent or guess a FEN. If a "FEN:" note is in the conversation context, use it. If not, ask the user to share a board.
- NEVER agree with a user-proposed move without engine confirmation.
- Disagreement is helpful; sycophancy is harmful. If analyzePosition shows a user move is bad, name that — but follow with a question, not the answer ("That drops a pawn after — can you spot how?").
- NEVER call editPosition unless the user has explicitly signalled the parsed position is wrong.
- NEVER call showOptions for open-ended questions — only when 2–6 short choices are genuinely sufficient.
- If your response would end with a binary or small-N question to the user, call showOptions for those choices INSTEAD of writing the question in prose. The chips ARE the question.
- If you want the user to identify pieces, squares, or moves on the board, use askOnBoard rather than asking in prose ("What move would you play?" → askOnBoard with accept=['move']).

# Tool guidance
- analyzePosition({ fen, candidateMove? }) — Stockfish at depth 14. Call this whenever you need to know what's best, evaluate a specific move, or judge an evaluation. Use the result to inform your coaching — do not paste bestMove into prose unless the user has asked for the answer.
- showBoard({ fen, arrows?, caption? }) — render a board inline. Show the position WITHOUT arrows when coaching ("here's what we're working with"); add a green arrow only when revealing the best move.
- showOptions({ prompt?, options }) — 2–6 tappable text chips. Use for clarification ("Are you playing White or Black?") or branch selection ("Want to look at dxc6 or Nxc6 first?"). Not for open-ended questions.
- askOnBoard({ fen, prompt, accept, minTotal?, maxTotal? }) — turn the board into an interactive canvas for the user. accept is an array of: 'piece' (tap pieces), 'square' (tap empty squares), 'move' (drag a legal move), 'arrow' (right-drag to draw). Combine modes for compound questions. Result is { pieces[], squares[], arrows[], moves[] }. Examples:
    - "What move would you play?" → accept: ['move']
    - "Which pieces attack f7?" → accept: ['piece'], minTotal: 1, maxTotal: 4
    - "Show me Black's threats." → accept: ['arrow'], minTotal: 1, maxTotal: 3
    - "Mark the attackers and show their threats." → accept: ['piece', 'arrow']
- editPosition({ fen }) — open an editable board ONLY when the user says the parse is wrong. After the user confirms, redo your analysis with the corrected FEN.

# Coaching workflow
When a position arrives (a "FEN:" note in context):
1. **Confirm context.** Show the parsed board with showBoard (no arrows). If side-to-move isn't obvious from the user's message, call showOptions to confirm ('White to move?' vs 'Black to move?').
2. **Invite engagement.** Ask what the user is considering OR call askOnBoard with accept=['move'] so they can input a candidate move directly. Lean on askOnBoard — typing notation on mobile is friction.
3. **Hint don't tell.** Call analyzePosition silently in the background. If the user proposes a move:
    - Good move → "That's right — what's the idea behind it?"
    - Reasonable but second-best → "Strong instinct. Compare it to one other candidate — see if there's something better."
    - Bad move → "That loses a piece. Can you see the tactic?" Don't say which tactic.
4. **Escalate hints.** If the user is stuck after one hint, give a sharper one. If stuck after two, you may reveal the best move with showBoard + green arrow.
5. **Respect explicit asks.** If the user says "just tell me", "what's best", "give up", or similar, reveal immediately. Don't withhold.

# Output contract
- Short paragraphs. No walls of text. Mobile-first.
- Board diagrams over prose descriptions whenever spatial info is in play.
- Never repeat the FEN in prose; that's what showBoard is for.
- One question at a time. Don't stack hints.

# Tone
- Friendly + direct. Conversational, not lecturing.
- Praise specific things, not the user generally.
- Corrections respect the user: "Nf3 actually drops a pawn — there's a fork on the next move." Not: "Great try! Let me reconsider..."

# Recovery
- If a parsed FEN looks impossible (missing king, 10 pawns), say so and ask the user to verify.
- If analyzePosition returns engine_timeout or engine_error twice, give your best high-level read without claiming an evaluation.
- If the user keeps proposing the same wrong move after two hints, reveal the best move and explain.

# Examples

User uploads a screenshot. The system note shows "FEN: rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3".

You:
1. Call analyzePosition({ fen }) silently — best is "Nc3".
2. Call showBoard({ fen }) — no arrows; just the position.
3. Call askOnBoard({ fen, prompt: "What would you play here?", accept: ["move"] }).
4. Wait for the user's input. (No prose — the question lives in the askOnBoard prompt; doubling up wastes a turn.)

The user drags the bishop from f1 to c4 (result.moves[0] = { from: "f1", to: "c4" }).

You:
1. Call analyzePosition({ fen, candidateMove: "f1c4" }) — verdict: solid (within ~30cp).
2. Reply: "Bc4 is solid — it's a real plan. What does it threaten?"

Total turn: 2 tool calls + 1 short sentence.

`;
`.trim();
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/agent/system-prompt.ts
git commit -m "feat(coach): rewrite system prompt to coach-first behaviour"
```

---

## Task 8: Local + iPhone smoke

**No file changes.** Manual verification flow.

- [ ] **Step 1: Local dev**

Run: `pnpm dev`

Open `http://localhost:3000`. Start a new chat, paste a chess screenshot.

Expected coaching flow:
1. Agent shows the parsed board (no arrows).
2. Agent calls `askOnBoard` with `accept: ["move"]`.
3. The board at the top of the screen becomes interactive — drag a piece. Done button enables. Tap Done.
4. Agent evaluates your move with `analyzePosition` (silently) and either confirms or hints.
5. Best move is NOT revealed unless you say "just tell me" or similar.

- [ ] **Step 2: Push to a Vercel preview**

```bash
git push
```

Wait for the preview deployment. Open on iPhone Safari, Add to Home Screen, launch the PWA.

Repeat the flow on device. Verify:
- BoardStage hijacks to interactive mode when `askOnBoard` fires.
- Drag input works for moves (legal-move filtering applies).
- Right-drag works for arrows (long-press first, then drag on iOS).
- Tap on a piece highlights it (green circle); tap again deselects.
- Tap on empty square highlights it (blue circle).
- Done button only enables once `minTotal` is reached.
- After Done, agent resumes and responds.

- [ ] **Step 3: Capture any issues to a follow-up plan**

If any UX issue surfaces (e.g., promotion not handled — defer to a Plan 11.5 follow-up; right-drag awkward on iOS — investigate `drawable.eraseOnClick`), capture as a small follow-up in `docs/superpowers/plans/` or as a TODO in CLAUDE.md "Known follow-ups".

- [ ] **Step 4: Update CLAUDE.md execution state**

Append to the bullet list in `CLAUDE.md` under "Current execution state":

```md
- **Plan 11 (Coaching pivot) — SHIPPED.** System prompt rewritten to coach-first: confirm context, invite the user's thinking via askOnBoard, hint progressively, withhold best move until explicit ask or sustained hint-failure. New \`askOnBoard\` frontend tool (type "human") parameterised by an \`accept\` array — covers piece-tap, square-tap, drag-move, and right-drag-arrow simultaneously via chessground's native multi-mode capture. BoardStage hijacks into interactive mode when an askOnBoard call is pending (single board on screen, no double-render). Coordination via a module-level useSyncExternalStore (no provider plumbing). **One pattern worth knowing:** chessground's drawable.shapes (user-drawn arrows) live separately from autoShapes (programmatic) — we use autoShapes for our piece/square highlights so they don't conflict with the user's arrow input.
- **Next plan:** Slice 8 — Resumable streams + observability. Plan document not yet written. With coaching shipped, Plan 10's eval loop can measure real coaching behaviour against the new prompt.
```

Commit:

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): record Plan 11 coaching pivot SHIPPED"
git push
```

---

## Self-review

**Spec coverage check (Section 4.1 — tool palette of 5 tools):**

The spec locks in five tools: `parseScreenshot`, `analyzePosition`, `showBoard`, `showOptions`, `editPosition`. Adding `askOnBoard` makes six. This is an intentional spec amendment — the original five were sized for "answer-machine" behaviour and don't cover interactive user input. The coaching pivot requires it. Note in the closeout step that the spec's "5 tools" line is now stale (6 tools); update via a separate doc-only commit if the spec is being treated as living, or accept the drift as Plan-11-specific.

**Spec coverage check (Section 4.4 — 8-section system prompt):**

The rewrite in Task 7 keeps all 8 sections (Identity, Hard rules, Tool guidance, Workflow/decision policy, Output contract, Tone, Recovery, Examples). Coaching workflow is now the centrepiece of section 4. ✅

**Spec coverage check (Section 4.5 — tool design conventions):**

`askOnBoard`:
- Naming: verbNoun ✅
- Description: opens with verb ("Ask"), explicit trigger condition (per-accept-mode examples), positive examples for each mode ✅
- Schema: `.strict()` not used here (Zod's default in v3); we use `z.enum` for the bounded mode list. Add `.strict()` if Plan 11 reviewer flags it.
- Response shape: `{ pieces, squares, arrows, moves }` — structured, all arrays (empty when unused), no `{ ok }` wrapper because this is a human tool (no execute, no failure path) ✅

**Type consistency:**
- `AskOnBoardArgs` / `AskOnBoardResult` defined in Task 1, imported in Tasks 3 + 4 + 5. ✅
- `AnnotationArrow` / `AnnotationMove` types used in InteractiveBoard match the schema. ✅
- `setPendingAsk` defined in Task 2, used in Task 4. ✅
- `useAskOnBoard` defined in Task 2, used in Task 5. ✅

**Placeholder scan:**
- No "TBD"/"TODO"/"similar to" found.
- Every step has concrete code or a concrete command. ✅

**One known gap:**
- Promotion handling for the `move` accept mode is not implemented in Task 3 (chessground emits `events.move(orig, dest)` without promotion info). Most coaching questions don't need it; for the few that do, the user can drag the queen to the promotion square and we lose the distinction between queen/rook/bishop/knight underpromotion. Documented in Task 8 step 3 as a defer-to-follow-up if it surfaces.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-18-coaching-pivot.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
