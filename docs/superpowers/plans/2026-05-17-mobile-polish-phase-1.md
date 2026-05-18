# Mobile Polish — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the PWA feel native and respect the brutal mobile-screen-estate constraint. The big architectural move is pinning the most-recent board at the top of the viewport (auto-collapsing on composer focus), with chat flowing below and a glassy composer floating at the bottom. Plus a lingering-bug sweep and refined message/tool-call presentation.

**Architecture:** Three vertical regions, top to bottom — `BoardStage` (pinned, collapsible), `Thread` (chat), glassy `Composer` (sticky bottom). `BoardStage` reads the most recent `showBoard` tool-call's input from the runtime's message state and renders it; the showBoard render fn returns `null` so it doesn't double-render in chat. Tool-call collapsibles become subtle "Analyzing…" indicators during streaming and disappear when complete.

**Tech Stack:** Existing — Tailwind (`backdrop-blur`), chessground, assistant-ui's reactive `useAui` state. No new dependencies. `vaul` already installed if we want drag-snap-points later (Phase 2).

---

## Scope discipline (per principles)

- **Phase 1 = the substrate**: layout + native feel + bug sweep. World-class details come in Phase 2.
- **NO snap-point drag gestures yet.** A simpler binary (expanded vs collapsed) + auto-collapse-on-typing solves 80% of the space problem for 30% of the complexity. Vaul drag-with-snaps lives in Phase 2 if Phase 1 isn't enough.
- **NO inline tappable move notation, eval bar, or move-list strip.** Phase 2 multipliers — high-leverage but not foundational.
- **NO typography overhaul, no color palette redesign.** Phase 3 — defer until the structural moves land.
- **NO A2HS banner / SW update toast.** Plan 9.5 polish if it matters in daily use.
- **NO tests.** Plan 10's eval loop owns automated behavior verification. Phase 1's smoke is browser + iPhone hands-on.

### Phase 2 (deferred, explicit list)

1. Vaul drag-snap-point sheet replacing the binary collapse (if Phase 1's auto-collapse feels stunted)
2. Inline tappable chess notation (`Nf3`, `dxc6` etc.) that flashes squares on the pinned board
3. Vertical eval bar beside board (Lichess pattern)
4. Move-list strip beneath board (scrollable chip strip)
5. Image-attachment card preview replacing the round chip

### Phase 3 (deferred, lower priority)

- Deliberate system-font stack + typography hierarchy pass
- Color palette decision (chess greens vs neutral restraint)
- A2HS banner
- SW "new version available" toast
- Suggestions chips above composer in empty state

## File structure

- Modify: `components/chat/chat-surface.tsx` — three-region layout (BoardStage / Thread / Composer)
- Create: `components/chat/board-stage.tsx` — pinned-top board area + collapse logic
- Modify: `components/chat/show-board-tool-ui.tsx` — render returns null (BoardStage owns visual display); keep `execute` resolving the tool-call
- Modify: `components/assistant-ui/thread.tsx` — quieter tool-call presentation; glassy composer styling; smaller user bubble
- Modify: `lib/persistence/use-history-adapter.ts` — IF the first-chat-didn't-save investigation finds something
- No new dependencies.

---

## Task 1: Lingering bug sweep

**Files:** investigation only; fix if found.

The reflection at the end of Plan 7 surfaced two unverified symptoms from the Plan 5/6 era:

- "First chat I created didn't save" — possibly a race during initial chat-row creation
- "Composer disappeared after streaming" — possibly the requires-action bug (should be fixed by Plan 5's B1 frontend-tool refactor, but unverified in this exact scenario)

- [ ] **Step 1: Verify on a fresh Dexie state in local dev.** Start dev server, open in a fresh isolated Chrome context (Dexie empty), send a simple message, refresh, confirm the chat and both messages persist. If they do — first-chat bug was already fixed in Plan 5/6. If they don't — diagnose.

- [ ] **Step 2: Verify composer-after-showBoard.** Send a message that triggers showBoard (e.g., upload a chess screenshot + ask for best move). After stream completes, confirm the composer is still visible. If it isn't, that means the assistant message status didn't resolve cleanly; debug from `useExternalHistory.isReady`.

- [ ] **Step 3: If both pass → commit nothing for this task** (no bug, no code change). Note in the close-out CLAUDE.md update that both are verified fixed-by-prior-work.

- [ ] **Step 4: If anything fails → diagnose root cause + fix in a single focused commit** before proceeding to Task 2.

```bash
# If a fix is needed:
git commit -m "fix(...): <root-cause summary>"
```

---

## Task 2: BoardStage — pin the most-recent board at the top

**Files:**
- Create: `components/chat/board-stage.tsx`
- Modify: `components/chat/chat-surface.tsx`
- Modify: `components/chat/show-board-tool-ui.tsx`

This is the keystone task — once the layout shifts, the rest cascades.

### Step 1: Reshape `chat-surface.tsx` to three regions

The chat-surface currently renders `<Thread />` as a single full-height region. Change it to a flex column with three regions:

```tsx
<AssistantRuntimeProvider runtime={runtime}>
  <ShowBoardToolUI />
  <ShowOptionsToolUI />
  <EditPositionToolUI />
  <div className="flex h-dvh flex-col">
    <ChatListDrawer currentThreadId={threadId} onSelect={setThreadId} />
    <BoardStage />
    <main className="min-h-0 flex-1 overflow-hidden">
      <Thread />
    </main>
  </div>
</AssistantRuntimeProvider>
```

Notes:
- `h-dvh` on the container (full dynamic viewport height)
- `flex-col` arranges BoardStage → Thread → Composer vertically
- `min-h-0` on the Thread main is critical — without it the chat region grows to content and overflows the viewport instead of scrolling internally
- The composer stays inside `<Thread />` for now (it's part of the assistant-ui Thread component); we just make sure the Thread itself fills the available height

### Step 2: Write `components/chat/board-stage.tsx`

The component reads the latest `tool-showBoard` part across all assistant messages in the current thread and renders `<Board>` with those args. When there's no showBoard yet (fresh chat), renders nothing (region collapses to 0 height).

```tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import { useAui } from "@assistant-ui/react";
import { parseFen } from "chessops/fen";
import { ChevronUpIcon, ChevronDownIcon } from "lucide-react";
import { Board, type BoardArrow, type ArrowBrush } from "@/lib/chess/board";

// Reads the most-recent `tool-showBoard` part from the active thread's
// assistant messages. Returns args (fen + arrows + caption) or undefined
// when there's nothing to show.
//
// Subscribes via `useAui` so a new showBoard call mid-stream updates the
// pinned board reactively.
type ShowBoardArgs = {
  readonly fen: string;
  readonly arrows?: readonly { readonly from: string; readonly to: string; readonly color?: ArrowBrush }[];
  readonly caption?: string;
};

const findLatestShowBoard = (messages: readonly unknown[]): ShowBoardArgs | undefined => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as { role?: unknown; content?: unknown };
    if (msg.role !== "assistant") continue;
    const content = msg.content;
    if (!Array.isArray(content)) continue;
    for (let j = content.length - 1; j >= 0; j--) {
      const part = content[j] as { type?: unknown; toolName?: unknown; args?: unknown };
      if (part.type !== "tool-call" || part.toolName !== "showBoard") continue;
      const args = part.args;
      if (args === null || typeof args !== "object") continue;
      const a = args as { fen?: unknown };
      if (typeof a.fen === "string" && parseFen(a.fen).isOk) {
        return args as ShowBoardArgs;
      }
    }
  }
  return undefined;
};

const toBoardArrows = (arrows: ShowBoardArgs["arrows"]): readonly BoardArrow[] =>
  (arrows ?? []).map((a) => ({ orig: a.from, dest: a.to, brush: a.color ?? "green" }));

export function BoardStage(): React.JSX.Element | null {
  const aui = useAui();
  // assistant-ui exposes message state via the runtime; subscribe through
  // useState + the runtime's subscribe API. (Verify the exact subscribe
  // signature in node_modules/@assistant-ui/react/dist; this is the
  // intended shape but the actual API may need adjustment.)
  const [messages, setMessages] = useState<readonly unknown[]>([]);
  useEffect(() => {
    const update = () => {
      const state = aui.thread().getState();
      setMessages((state as { messages?: readonly unknown[] }).messages ?? []);
    };
    update();
    const unsub = aui.thread().subscribe(update);
    return () => unsub();
  }, [aui]);

  const latest = useMemo(() => findLatestShowBoard(messages), [messages]);
  const [expanded, setExpanded] = useState(true);

  if (!latest) return null;

  return (
    <div className="border-border bg-background sticky top-0 z-10 flex flex-col items-center gap-1 border-b">
      {expanded ? (
        <>
          <Board fen={latest.fen} arrows={toBoardArrows(latest.arrows)} />
          {latest.caption !== undefined && latest.caption !== "" ? (
            <p className="text-muted-foreground pb-2 text-xs">{latest.caption}</p>
          ) : null}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground py-1 text-xs"
            onClick={() => setExpanded(false)}
            aria-label="Collapse board"
          >
            <ChevronUpIcon className="size-4" />
          </button>
        </>
      ) : (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex w-full items-center justify-center gap-1 py-2 text-xs"
          onClick={() => setExpanded(true)}
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

Notes:
- `useAui().thread().subscribe()` API path is the intended shape; verify the exact method via `grep -rn "thread()" node_modules/@assistant-ui/react/dist | head -20` and adjust if needed. The actual subscribe pattern may be `runtime.thread.subscribe(callback)` directly without the `()` call.
- The `parseFen` guard means a partial-streaming FEN (mid-tool-input) won't try to render until valid.
- Collapsed state is a thin "Position pinned ⌄" strip (~36pt). Massive screen-estate win.

### Step 3: Auto-collapse on composer focus

In `chat-surface.tsx`, share a `boardExpanded` state between BoardStage and a listener that watches composer focus. Simplest: an event-bus pattern via `window.dispatchEvent` would be ugly. Cleaner: lift `expanded` state to chat-surface and pass to BoardStage; listen for `focusin` events whose target is inside the Thread's composer textarea.

The assistant-ui Composer textarea has `aria-label="Message input"`. We can listen at the chat-surface level:

```tsx
// In chat-surface.tsx
const [boardExpanded, setBoardExpanded] = useState(true);

useEffect(() => {
  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.getAttribute("aria-label") === "Message input") {
      setBoardExpanded(false);
    }
  };
  document.addEventListener("focusin", onFocusIn);
  return () => document.removeEventListener("focusin", onFocusIn);
}, []);

// Pass to BoardStage:
<BoardStage expanded={boardExpanded} onExpandedChange={setBoardExpanded} />
```

Then BoardStage becomes controlled — `expanded` prop required, internal `useState` removed.

If `focusin` doesn't fire reliably in PWA mode (iOS Safari has quirks), fall back to a `useChat` API hook (`useThreadComposer` may expose focus state) — verify in assistant-ui types if `focusin` proves flaky.

### Step 4: Make showBoard's render return null

In `components/chat/show-board-tool-ui.tsx`, change the render fn to return `null` (or a single space — assistant-ui may treat truly-null as "still rendering"). The visual display is now BoardStage's job. The execute still resolves the tool-call so persistence works.

```tsx
// In show-board-tool-ui.tsx, replace the existing render block:
render: () => null,
```

Remove the `parseFen` validation that lived in this render — BoardStage does it instead.

### Step 5: Pipeline

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm build 2>&1 | tail -15
git checkout -- tsconfig.json
```

### Step 6: Local smoke

```bash
pnpm dev
```

In a fresh isolated Chrome context:
1. Send a chess image + "what's the best move" → expect board pinned at top, agent text below, composer at bottom.
2. Tap the composer → expect board to collapse to "Position pinned ⌄" strip.
3. Tap the strip → expect board to expand again.
4. Scroll the chat → board stays pinned at top (sticky).
5. Refresh → board re-appears from persisted history.

### Step 7: Commit

```bash
git add components/chat/board-stage.tsx components/chat/chat-surface.tsx components/chat/show-board-tool-ui.tsx
git commit -m "$(cat <<'EOF'
feat(ui): pin the most-recent board at the top, auto-collapse on type

Largest layout shift: chat-surface now has three vertical regions —
BoardStage (sticky top, reads latest tool-showBoard from message state)
+ Thread (chat) + Composer (sticky bottom inside Thread). Board
auto-collapses to a thin strip when the composer gets focus, expands
back when the user taps the strip or another showBoard fires.

showBoard's render fn returns null now; BoardStage owns the visual
display. This eliminates the screen-estate disaster of inline boards
that ate ~70% of viewport height in the previous layout.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Quiet the tool-call presentation

**Files:** `components/assistant-ui/thread.tsx`

Currently `analyzePosition` tool-calls render as a "1 tool call" collapsible chip in chain-of-thought groups. It's visually noisy and meaningful to no one (the user doesn't care that the engine ran; they care about the answer).

### Step 1: Decide UX

- **During streaming** (tool is running): subtle "Analyzing position…" text with three pulsing dots next to it, no chip
- **After streaming** (tool complete): hide entirely. The agent's prose response already references the analysis. The user never needs to see the tool call.

### Step 2: Modify thread.tsx's `groupBy`

The current `groupBy` puts analyzePosition into `group-tool` (the collapsible CoT wrapper). Change to: don't group tool-calls. Render each tool-call inline via the `tool-call` case, which currently falls through to `part.toolUI ?? <ToolFallback {...part} />`.

For `analyzePosition` specifically:
- It HAS no registered toolUI (we didn't write `makeAssistantToolUI` for it — server tool).
- It would fall through to `ToolFallback` which is the chunky chip.

We need a custom render for analyzePosition: an inline `<AnalyzingIndicator status={status} />` that shows the pulsing-dots line while running and renders nothing when complete.

Approach A — modify `groupBy` to return null for analyzePosition (so it renders inline) AND override the `tool-call` case to handle analyzePosition specifically:

```tsx
case "tool-call":
  if (part.toolName === "analyzePosition") {
    return <AnalyzingIndicator status={part.status} />;
  }
  return part.toolUI ?? <ToolFallback {...part} />;
```

Approach B — create a registered tool-UI for analyzePosition via `makeAssistantToolUI` that renders the indicator. Cleaner but more file-spread.

Either works; A is fewer files. Pick A.

### Step 3: Write `AnalyzingIndicator`

Tiny inline component:

```tsx
const AnalyzingIndicator: FC<{ status?: { type: string } }> = ({ status }) => {
  if (status?.type !== "running") return null;
  return (
    <p className="text-muted-foreground my-2 flex items-center gap-1 text-xs">
      <span className="bg-muted-foreground/60 inline-block size-1.5 animate-pulse rounded-full" />
      Analyzing position…
    </p>
  );
};
```

The `animate-pulse` Tailwind utility gives a subtle pulse. Could refine to three-dot wave with custom CSS but `animate-pulse` ships immediately.

### Step 4: Pipeline + commit

```bash
pnpm typecheck && pnpm lint && pnpm format:check
git add components/assistant-ui/thread.tsx
git commit -m "feat(ui): quiet the analyzePosition tool-call to a pulsing indicator"
```

---

## Task 4: Glassy floating composer

**Files:** `components/assistant-ui/thread.tsx`

Currently the composer has `bg-background` (solid). On scroll, content slides under it but it looks like a hard cap. Native pattern: composer floats as a glass element, chat appears to flow under it.

### Step 1: Edit composer styling

In thread.tsx's `Composer` component, change the wrapper className:

```tsx
// Find this current line in the Composer component:
className="bg-background focus-within:border-ring/75 ..."

// Change `bg-background` to:
className="bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 focus-within:border-ring/75 ..."
```

And on `ThreadPrimitive.ViewportFooter`:

```tsx
// Currently:
className="aui-thread-viewport-footer bg-background sticky bottom-0 ..."

// Becomes:
className="aui-thread-viewport-footer bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky bottom-0 ..."
```

(Adjust exact selectors based on the actual current file structure.)

### Step 2: Test in dev — confirm chat content shows through composer when scrolled

### Step 3: Commit

```bash
git add components/assistant-ui/thread.tsx
git commit -m "feat(ui): glassy floating composer (backdrop-blur)"
```

---

## Task 5: Smaller user bubble + assistant rhythm

**Files:** `components/assistant-ui/thread.tsx`

Currently the user message bubble is a heavy gray rounded pill. Visually outweighs the assistant text. Asymmetric.

### Step 1: Lighten the user bubble

In thread.tsx's `UserMessage` component, find the wrapper:

```tsx
// Current:
className="aui-user-message-content peer bg-muted text-foreground rounded-2xl px-4 py-2.5 wrap-break-word empty:hidden"

// Becomes:
className="aui-user-message-content peer bg-muted/60 text-foreground rounded-2xl px-3 py-2 text-sm wrap-break-word empty:hidden"
```

- `bg-muted/60` softens the background
- Tighter padding (`px-3 py-2` instead of `px-4 py-2.5`)
- `text-sm` makes user messages visually quieter than assistant content

### Step 2: Increase line-height on assistant content for readability

In `AssistantMessage` content wrapper:

```tsx
// Current:
className="text-foreground px-2 leading-relaxed wrap-break-word"

// Becomes:
className="text-foreground px-2 leading-7 wrap-break-word"  // ~28px line on 16px text
```

`leading-7` gives more breathing room than `leading-relaxed` (`1.625`).

### Step 3: Pipeline + commit

```bash
pnpm typecheck && pnpm lint && pnpm format:check
git add components/assistant-ui/thread.tsx
git commit -m "feat(ui): rebalance message weight — lighter user bubble, looser assistant line-height"
```

---

## Task 6: Local smoke + iPhone test

**Files:** none

### Step 1: Dev server smoke (Chrome)

```bash
pnpm dev
```

In a fresh isolated context:
- Verify layout: BoardStage area is empty (zero height) before first message.
- Send "hi" → assistant responds → no board visible (no showBoard called).
- Upload chess screenshot + "best move" → board appears pinned at top, agent text below.
- Tap composer → board collapses to thin strip.
- Tap strip → board re-expands.
- Tap composer + start typing → board stays collapsed; composer is glassy when content scrolls past.
- Verify user message bubble looks lighter than before; assistant text has visible breathing room.

### Step 2: Build smoke

```bash
pnpm build 2>&1 | tail -15
git checkout -- tsconfig.json
```

### Step 3: Deploy + iPhone test (Mark)

```bash
git push origin main
```

Wait for Vercel, then on iPhone PWA (already installed from Plan 7):
- Force-quit + reopen the PWA. The SW should auto-update (Plan 7 verified).
- Send the same flows. Verify the layout works in iOS Safari PWA standalone mode.
- Check the safe-area-inset on the composer (should not be hidden under iOS home indicator).
- Check the keyboard interaction: when typing, board collapses, composer stays visible above the keyboard.

If anything breaks specifically on iOS that didn't break in Chrome, that's where the rough edges live. Note them for Phase 2 or a Plan 9.5.

---

## Task 7: Close out — CLAUDE.md update

**Files:** `CLAUDE.md`

### Step 1: Replace the Plan 9 line in execution-state

```
- **Plan 9 — Mobile polish Phase 1 — SHIPPED.** Three-region layout: pinned `BoardStage` (most-recent showBoard from message state, auto-collapses on composer focus), `Thread` (chat scrolls), glassy floating composer (backdrop-blur). `showBoard`'s render is `null` — BoardStage owns the visual display. analyzePosition tool-call quieted to a subtle "Analyzing position…" pulse during streaming, hidden after complete. User bubble lightened (`bg-muted/60`, tighter padding); assistant line-height looser. Phase 2 (vaul snap-points, inline tappable notation, eval bar, move-list strip, image-attachment card) and Phase 3 (typography pass, color palette, A2HS banner, SW update toast) deferred.
- **Next plan:** Slice 8 — Resumable streams + observability. Plan document not yet written.
```

### Step 2: Commit + push

```bash
git add CLAUDE.md
git commit -m "docs: mark Plan 9 Phase 1 complete; resume marker → Slice 8"
git push origin main
```

---

## Done

End state:
- App layout is **board-on-top + chat-in-middle + composer-on-bottom** with auto-collapse on type. Space constraint respected.
- Composer is **glassy + sticky**, content flows visibly underneath. iMessage/native pattern.
- Tool-call noise is gone; only the agent's prose + the pinned board are visible.
- User message visual weight is reduced; assistant content has breathing room.
- Lingering bugs from Plan 5/6/7 era are either verified-fixed or actually fixed.

What you still want but is intentionally deferred:
- Drag-with-snap-points sheet for board sizing (Phase 2)
- Inline tappable chess notation that flashes squares (Phase 2)
- Vertical eval bar (Phase 2)
- Move-list strip (Phase 2)
- Image-attachment card preview (Phase 2)
- Typography stack pass (Phase 3)
- Color palette decision (Phase 3)
- A2HS banner + SW update toast (Phase 3)
