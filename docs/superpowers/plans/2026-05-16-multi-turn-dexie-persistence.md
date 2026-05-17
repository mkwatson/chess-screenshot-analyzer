# Multi-turn + Dexie Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat history survives page refresh and PWA cold-start; follow-up messages in the same conversation just work.

**Architecture:** A single Dexie v4 database with one table (`messages`). assistant-ui's `ThreadHistoryAdapter.withFormat` is the integration seam — its `load` reads past messages from Dexie on mount, `append` writes each completed message. One hardcoded `chatId` ("@default") for Plan 4; the multi-chat list and `chats` table arrive in Plan 5.

**Tech Stack:** Dexie v4, `@assistant-ui/react` `ThreadHistoryAdapter`, AI SDK v6 `UIMessage` round-trip via the adapter's format helper.

---

## Scope notes (anti-overengineering, per principles)

The spec (Section 6) describes a `ChatRepository` interface and a `requestIdleCallback` streaming-write coalescer. **Both are out of scope for Plan 4.** Reasons:

- **No coalescer.** The history adapter's `append` runs *once per completed message* (per assistant-ui docs), not per token. The "30-100 Hz token jank" the coalescer solves doesn't exist in this path.
- **No repository interface.** We have one storage (Dexie), one consumer (the history adapter). YAGNI. Plan 5 (multi-chat list) is the second consumer; promote to an interface then if needed.
- **No `chats` table.** Plan 4 is single-chat. The hardcoded `chatId` is sufficient. Plan 5 introduces `chats`.
- **No `validateUIMessages` on load.** Spec section 6.6 calls for schema-drift validation; this matters once we have stored history *across* schema changes. Plan 4 introduces the storage — no drift surface yet. Add at the first schema change.

## File structure

- Create: `lib/persistence/db.ts` — Dexie database instance + schema + row type
- Create: `lib/persistence/history-adapter.ts` — `ThreadHistoryAdapter` for assistant-ui
- Modify: `components/chat/chat-surface.tsx` — pass `adapters.history` to `useChatRuntime`
- Modify: `package.json` — add `dexie`

No tests added. Per principle 11 (tests-as-minimum-complexity): TypeScript types prove the adapter shape; the local smoke test ("refresh persists history") is a single deterministic browser check that's faster and more truthful than a mocked unit test of Dexie. A unit test of the adapter would mock Dexie (no value) or test Dexie itself (not our code).

---

## Task 1: Install Dexie

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install**

```bash
pnpm add dexie@^4.0.0
```

- [ ] **Step 2: Verify version**

```bash
pnpm list dexie
```

Expected: `dexie 4.x.x`.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add dexie@^4 for Plan 4 persistence"
```

---

## Task 2: Dexie database (`lib/persistence/db.ts`)

**Files:**
- Create: `lib/persistence/db.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/persistence/db.ts
import Dexie, { type Table } from "dexie";

// Plan 4 stores one message per row. `chatId` is hardcoded to "@default"
// (single-chat); Plan 5 will introduce the chats table + chatId per row.
// `parentId` and `format` come from assistant-ui's history adapter format
// helper (see lib/persistence/history-adapter.ts).
export interface MessageRow {
  readonly id: string;
  readonly chatId: string;
  readonly parentId: string | null;
  readonly format: string;
  // Opaque JSON payload — encoded by assistant-ui's format helper. We never
  // inspect it server-side or in app code; it round-trips through the
  // adapter's encode/decode pair.
  readonly content: unknown;
  readonly createdAt: number;
}

class CoachDb extends Dexie {
  readonly messages!: Table<MessageRow, string>;

  constructor() {
    super("chess-coach");
    // Compound index `[chatId+createdAt]` lets us load a single chat's
    // history in order without scanning the table.
    this.version(1).stores({
      messages: "id, chatId, [chatId+createdAt]",
    });
  }
}

export const db = new CoachDb();

export const DEFAULT_CHAT_ID = "@default";
```

- [ ] **Step 2: Type-check**

```bash
pnpm typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add lib/persistence/db.ts
git commit -m "feat(persistence): Dexie schema for single-chat history"
```

---

## Task 3: History adapter (`lib/persistence/history-adapter.ts`)

**Files:**
- Create: `lib/persistence/history-adapter.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/persistence/history-adapter.ts
import type { ThreadHistoryAdapter } from "@assistant-ui/react";
import { db, DEFAULT_CHAT_ID, type MessageRow } from "./db";

// assistant-ui's history adapter uses a `withFormat` wrapper so messages
// round-trip as AI SDK v6 UIMessage objects. The format helper handles
// encode/decode; we own the storage layer (Dexie).
//
// Plan 4 hardcodes chatId — single-chat. Plan 5 wires multiple chats.
export const historyAdapter: ThreadHistoryAdapter = {
  // Required by the type but unused by useChatRuntime per assistant-ui docs
  // (the withFormat branch supersedes both).
  load: () => Promise.resolve({ headId: null, messages: [] }),
  append: () => Promise.resolve(),
  withFormat: (fmt) => ({
    async load() {
      const rows = await db.messages
        .where("[chatId+createdAt]")
        .between([DEFAULT_CHAT_ID, 0], [DEFAULT_CHAT_ID, Number.MAX_SAFE_INTEGER])
        .toArray();
      return { messages: rows.map((r) => fmt.decode(r.content)) };
    },
    async append(item) {
      const row: MessageRow = {
        id: fmt.getId(item.message),
        chatId: DEFAULT_CHAT_ID,
        parentId: item.parentId,
        format: fmt.format,
        content: fmt.encode(item),
        createdAt: Date.now(),
      };
      await db.messages.put(row);
    },
  }),
};
```

- [ ] **Step 2: Type-check + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: clean.

If `fmt.decode` returns an unconstrained type and lint complains, check the type of `fmt` exported from `@assistant-ui/react` (grep `withFormat` in `node_modules/@assistant-ui/react/dist/*.d.ts`) and tighten as needed. Do **not** add `any` — use the package's published types.

- [ ] **Step 3: Commit**

```bash
git add lib/persistence/history-adapter.ts
git commit -m "feat(persistence): ThreadHistoryAdapter backed by Dexie"
```

---

## Task 4: Wire adapter into chat surface

**Files:**
- Modify: `components/chat/chat-surface.tsx`

- [ ] **Step 1: Edit the file**

Update the `useChatRuntime` call to include the history adapter alongside the existing attachments adapter:

```tsx
"use client";

import { AssistantRuntimeProvider, SimpleImageAttachmentAdapter } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { ShowBoardToolUI } from "./show-board-tool-ui";
import { historyAdapter } from "@/lib/persistence/history-adapter";

export const ChatSurface = (): React.JSX.Element => {
  const runtime = useChatRuntime({
    adapters: {
      attachments: new SimpleImageAttachmentAdapter(),
      history: historyAdapter,
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ShowBoardToolUI />
      <main className="flex min-h-dvh flex-col pb-[env(safe-area-inset-bottom)]">
        <Thread />
      </main>
    </AssistantRuntimeProvider>
  );
};
```

- [ ] **Step 2: Type-check + lint + format check**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/chat/chat-surface.tsx
git commit -m "feat(chat): wire history adapter into useChatRuntime"
```

---

## Task 5: Local smoke (refresh persists history)

**Files:** none

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Browser test**

Open `http://localhost:3000` in a browser. Verify:

1. **Empty thread on first load.** No prior messages (Dexie is fresh).
2. **Send a text message** ("hi") → assistant replies (this exercises text-only agent loop + writes both messages to Dexie via `append`).
3. **Hard-refresh the page** (Cmd-R).
4. **Past messages reload.** Both the user's "hi" and the assistant's reply appear in the thread *before* you type anything new.
5. **Send a follow-up** ("what about chess?") → conversation continues with the past context (server receives full message history in the next `/api/chat` POST).

If step 4 fails (thread empty after refresh): open browser DevTools → Application → IndexedDB → `chess-coach` → `messages`. Confirm rows are present. If rows are there but the thread doesn't reload, the adapter's `load` isn't firing or the format decode is broken — log inside `load` to debug.

If step 5 fails (no past context in follow-up reply): the server `/api/chat` route reads `messages` from the request body. Network tab → check the POST payload includes the full history.

- [ ] **Step 3: Stop dev server, no commit needed**

This is a verification step. If anything broke, fix in place (likely re-edit Task 3 or Task 4 files) and commit the fix with a `fix(persistence): …` message before proceeding.

---

## Task 6: Deploy + production smoke

**Files:** none

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Wait for Vercel ready**

```bash
until vercel ls chess-screenshot-analyzer --prod 2>&1 | head -4 | tail -1 | grep -q "● Ready"; do sleep 10; done
vercel ls chess-screenshot-analyzer --prod | head -4 | tail -1
```

- [ ] **Step 3: HTTP smoke (page renders, /api/chat still streams)**

```bash
PROD="https://chess-screenshot-analyzer-two.vercel.app"
curl -sI "$PROD/" | head -1
curl -s -X POST "$PROD/api/chat" \
  -H 'content-type: application/json' \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"hi"}]}]}' \
  --max-time 30 -w '\nHTTP %{http_code}\n' | head -c 300
```

Expected: HTML 200, /api/chat streams.

- [ ] **Step 4: Phone test (Mark, iOS Safari + PWA)**

Open the production URL on the iPhone:

1. Clear the existing PWA install (or use a private Safari tab if testing in browser mode) so Dexie starts empty.
2. Send "hi" → assistant replies.
3. Paste a chess screenshot → assistant replies with board.
4. Force-quit Safari / the PWA. Reopen the URL.
5. **All prior messages should be present** — text, image thumbnail, rendered board with arrow.
6. Send another message in the same thread → response uses prior context.

If anything broke, check Vercel function logs and browser console.

---

## Task 7: Close out — CLAUDE.md + final commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update execution-state block**

Replace the "Plan 4" line in CLAUDE.md's execution state with:

```
- **Plan 4 (multi-turn + Dexie persistence) — SHIPPED.** Chat history survives refresh and PWA cold-start. One Dexie table (`messages`), one hardcoded chatId, integrated via assistant-ui's `ThreadHistoryAdapter.withFormat`. No repository interface (single consumer); no streaming-write coalescer (`append` runs per-message, not per-token).
- **Next plan:** Slice 5 — Multi-chat list. Plan document not yet written.
```

- [ ] **Step 2: Commit + push**

```bash
git add CLAUDE.md
git commit -m "docs: mark Plan 4 complete; resume marker → Slice 5"
git push origin main
```

---

## Done

End state of Plan 4:
- Refresh / cold-start / app-relaunch all preserve the thread.
- Follow-up messages in the same chat work — full history sent to `/api/chat` each turn.
- Storage layer is one file (`lib/persistence/db.ts`) + one adapter (`lib/persistence/history-adapter.ts`).
- No premature abstraction. Plan 5 will add multi-chat (introduce `chats` table + chat list UI + maybe promote to an interface).
