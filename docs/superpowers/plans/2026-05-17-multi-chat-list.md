# Multi-Chat List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multiple persisted chats, switchable from a bottom Drawer. Tap a chat → resume it. Tap "New chat" → start fresh. Each chat persists independently via Dexie.

**Architecture:** Add a `chats` Dexie table. Replace the static single-thread `RemoteThreadListAdapter` (Plan 4) with a Dexie-backed one whose `list()`/`initialize()`/`delete()` read and mutate the table. Move the history adapter from a global `adapters: { history }` to `unstable_Provider` on the thread-list adapter — it now reads the active thread's `remoteId` dynamically (canonical pattern from `useAssistantCloudThreadHistoryAdapter`). A vaul-via-shadcn Drawer shows the chat list and provides "new chat" + per-row delete.

**Tech Stack:** Dexie v4 (schema v2), `nanoid` for chat IDs, vaul via shadcn `Drawer`, assistant-ui's `RuntimeAdapterProvider` + `useAui` for per-thread adapter injection.

---

## Scope notes (per principles)

- **No board-thumbnail column** on chats yet. Plain title + date row is enough; thumbnails are Plan 9 (mobile polish).
- **No archive/unarchive UI.** The interface methods exist as no-ops because `RemoteThreadListAdapter` requires them; we don't render an "Archive" button anywhere.
- **No LLM-generated titles.** First-user-message-text-slice is the title until the user renames. Auto-renaming via LLM is a Plan 6+ concern.
- **No pagination, no infinite scroll.** v0 chat counts are tiny; Dexie reads return all rows. Pagination is Plan 7+.
- **No settings/export/clear-data overflow menu.** Spec mentions it as part of the Drawer's "full snap"; Plan 7 (PWA + settings) owns it.
- **Migration of existing Dexie data:** v2 upgrade adopts any pre-existing `messages` (chatId=`@default`) into a single auto-created chat row. Lossless. No coordination needed (each user's browser handles itself).
- **No streaming-write coalescer** — same reasoning as Plan 4. `append` runs per-completed-message, not per-token.

## File structure

- Create: `lib/persistence/thread-list-adapter.ts` — Dexie-backed `RemoteThreadListAdapter` (with `unstable_Provider`).
- Create: `lib/persistence/use-history-adapter.ts` — hook returning a per-thread `ThreadHistoryAdapter` that reads the active `remoteId` via `useAui`.
- Create: `components/chat/chat-list-drawer.tsx` — vaul Drawer + chat rows + New Chat / Delete actions.
- Modify: `lib/persistence/db.ts` — schema v2: add `chats` table + `upgrade()` for legacy rows.
- Modify: `components/chat/chat-surface.tsx` — replace static adapter; manage current `threadId` state; render Drawer.
- Delete: `lib/persistence/history-adapter.ts` — replaced by `use-history-adapter.ts`.

No new tests. The local smoke (Task 8) is the verification — types prove the adapter shape; the smoke proves the multi-chat round-trip.

---

## Task 1: Dependencies

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `components.json` (shadcn registry)
- Create (via shadcn CLI): `components/ui/drawer.tsx`

- [ ] **Step 1: Install nanoid + add shadcn Drawer (brings vaul)**

```bash
pnpm add nanoid
pnpm dlx shadcn@latest add drawer
```

The shadcn CLI may prompt for overwrites. Answer `n` to anything it asks to overwrite (e.g., if it tries to overwrite `button.tsx`).

- [ ] **Step 2: Verify**

```bash
pnpm list nanoid vaul
ls components/ui/drawer.tsx
```

Expected: `nanoid` and `vaul` listed, drawer file present.

- [ ] **Step 3: Pipeline check** (the generated `drawer.tsx` may need a small lint fix)

```bash
pnpm typecheck && pnpm lint
```

If the generated file violates project lint rules (e.g., `any`), fix in place — do NOT add eslint-disable. The generated file is now ours.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml components.json components/ui/drawer.tsx
git commit -m "chore(deps): add nanoid + shadcn drawer (vaul) for Plan 5"
```

---

## Task 2: Dexie schema v2 (add `chats` table)

**Files:**
- Modify: `lib/persistence/db.ts`

- [ ] **Step 1: Update db.ts**

```ts
// lib/persistence/db.ts
import Dexie, { type Table } from "dexie";

export interface ChatRow {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

// Field names mirror assistant-ui's MessageStorageEntry<T> (snake_case
// parent_id) so rows pass straight to `fmt.decode`. `chatId` and
// `createdAt` are our own index columns.
export interface MessageRow {
  readonly id: string;
  readonly chatId: string;
  readonly parent_id: string | null;
  readonly format: string;
  readonly content: Record<string, unknown>;
  readonly createdAt: number;
}

class CoachDb extends Dexie {
  readonly chats!: Table<ChatRow, string>;
  readonly messages!: Table<MessageRow, string>;

  constructor() {
    super("chess-coach");
    // v1: messages table only (Plan 4)
    this.version(1).stores({
      messages: "id, chatId, [chatId+createdAt]",
    });
    // v2: add chats table + adopt any legacy @default messages
    // into a single auto-created chat row.
    this.version(2)
      .stores({
        chats: "id, updatedAt",
        messages: "id, chatId, [chatId+createdAt]",
      })
      .upgrade(async (tx) => {
        const messageCount = await tx.table("messages").count();
        if (messageCount === 0) return;
        const now = Date.now();
        await tx.table("chats").put({
          id: "@default",
          title: "Chat",
          createdAt: now,
          updatedAt: now,
        });
      });
  }
}

export const db = new CoachDb();
```

Remove the `DEFAULT_CHAT_ID` export — Plan 5 uses dynamic ids.

- [ ] **Step 2: Type-check**

```bash
pnpm typecheck
```

Expected: errors about `DEFAULT_CHAT_ID` no longer being exported from `lib/persistence/db.ts`. These point to the files that need updating next.

- [ ] **Step 3: Commit (will type-fail in isolation — that's fine, fix-up commits follow)**

Hold off on committing until Tasks 3-5 land — let them go in as a single coherent commit, since `DEFAULT_CHAT_ID` removal cascades.

Actually, since we want each task to land separately for review, keep the export temporarily:

```ts
// Temporary — remove in Task 5 once chat-surface no longer needs it.
export const DEFAULT_CHAT_ID = "@default";
```

Then:

```bash
git add lib/persistence/db.ts
git commit -m "feat(persistence): Dexie schema v2 — add chats table + legacy upgrade"
```

---

## Task 3: Per-thread history adapter

**Files:**
- Create: `lib/persistence/use-history-adapter.ts`
- Delete: `lib/persistence/history-adapter.ts`

- [ ] **Step 1: Write the hook**

```ts
// lib/persistence/use-history-adapter.ts
"use client";

import { useState } from "react";
import { useAui } from "@assistant-ui/store";
import type {
  GenericThreadHistoryAdapter,
  MessageFormatAdapter,
  MessageStorageEntry,
  ThreadHistoryAdapter,
} from "@assistant-ui/react";
import { db, type MessageRow } from "./db";

// Canonical pattern lifted from `useAssistantCloudThreadHistoryAdapter`:
// the adapter reads the active thread's remoteId on every load/append
// via `aui.threadListItem().getState().remoteId`. That makes it usable
// across thread switches without re-creating the adapter.
//
// Mount this hook inside the thread-list adapter's `unstable_Provider`
// and wrap children with `RuntimeAdapterProvider({ adapters: { history } })`
// so assistant-ui's `useExternalHistory` picks it up.
class DexieThreadHistoryAdapter implements ThreadHistoryAdapter {
  constructor(private aui: ReturnType<typeof useAui>) {}

  private currentChatId(): string | undefined {
    return this.aui.threadListItem().getState().remoteId ?? undefined;
  }

  // Required by the type but unused on the AI SDK path (withFormat
  // supersedes both per assistant-ui docs).
  load = () => Promise.resolve({ headId: null, messages: [] });
  append = () => Promise.resolve();

  withFormat<TMessage, TStorageFormat extends Record<string, unknown>>(
    fmt: MessageFormatAdapter<TMessage, TStorageFormat>,
  ): GenericThreadHistoryAdapter<TMessage> {
    const adapter = this;
    return {
      async load() {
        const chatId = adapter.currentChatId();
        if (!chatId) return { messages: [] };
        const rows = await db.messages
          .where("[chatId+createdAt]")
          .between([chatId, 0], [chatId, Number.MAX_SAFE_INTEGER])
          .toArray();
        return {
          messages: rows.map((r) => {
            const entry: MessageStorageEntry<TStorageFormat> = {
              id: r.id,
              parent_id: r.parent_id,
              format: r.format,
              content: r.content as TStorageFormat,
            };
            return fmt.decode(entry);
          }),
        };
      },
      async append(item) {
        const chatId = adapter.currentChatId();
        if (!chatId) return; // shouldn't happen — initialize sets remoteId first
        const row: MessageRow = {
          id: fmt.getId(item.message),
          chatId,
          parent_id: item.parentId,
          format: fmt.format,
          content: fmt.encode(item),
          createdAt: Date.now(),
        };
        await db.transaction("rw", db.messages, db.chats, async () => {
          await db.messages.put(row);
          await db.chats.update(chatId, { updatedAt: row.createdAt });
        });
      },
    };
  }
}

export const useHistoryAdapter = (): ThreadHistoryAdapter => {
  const aui = useAui();
  const [adapter] = useState(() => new DexieThreadHistoryAdapter(aui));
  return adapter;
};
```

- [ ] **Step 2: Delete the old module**

```bash
git rm lib/persistence/history-adapter.ts
```

(It will compile-fail in chat-surface.tsx until Task 5 — that's expected.)

- [ ] **Step 3: Type-check**

```bash
pnpm typecheck
```

Expected: errors only in chat-surface.tsx (Task 5's job). The new file should type-check cleanly in isolation.

- [ ] **Step 4: Commit (paired with Task 4 for atomicity — see Task 4)**

Hold the commit.

---

## Task 4: Dexie-backed RemoteThreadListAdapter

**Files:**
- Create: `lib/persistence/thread-list-adapter.ts`

- [ ] **Step 1: Write the adapter**

```ts
// lib/persistence/thread-list-adapter.ts
"use client";

import { useMemo } from "react";
import { RuntimeAdapterProvider } from "@assistant-ui/react";
import type {
  RemoteThreadListAdapter,
  RemoteThreadMetadata,
} from "@assistant-ui/react";
import { db } from "./db";
import { useHistoryAdapter } from "./use-history-adapter";

const toMetadata = (row: { id: string; title: string }): RemoteThreadMetadata => ({
  status: "regular",
  remoteId: row.id,
  title: row.title,
});

// Per-thread context: assistant-ui mounts this around each active
// thread's tree. We use it to bind a thread-aware history adapter via
// RuntimeAdapterProvider — assistant-ui's useExternalHistory will pick
// `adapters.history` up from this context.
const PerThreadAdapters = ({ children }: { children: React.ReactNode }) => {
  const history = useHistoryAdapter();
  const adapters = useMemo(() => ({ history }), [history]);
  return <RuntimeAdapterProvider adapters={adapters}>{children}</RuntimeAdapterProvider>;
};

export const dexieThreadListAdapter: RemoteThreadListAdapter = {
  list: async () => {
    const rows = await db.chats.orderBy("updatedAt").reverse().toArray();
    return { threads: rows.map(toMetadata) };
  },
  initialize: async (threadId) => {
    // assistant-ui generates `threadId` (a local UUID) before any
    // remote exists. We use it as the chat row's permanent id.
    const now = Date.now();
    await db.chats.put({
      id: threadId,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
    });
    return { remoteId: threadId, externalId: undefined };
  },
  rename: async (threadId, newTitle) => {
    await db.chats.update(threadId, { title: newTitle });
  },
  archive: () => Promise.resolve(),
  unarchive: () => Promise.resolve(),
  delete: async (threadId) => {
    await db.transaction("rw", db.chats, db.messages, async () => {
      await db.chats.delete(threadId);
      await db.messages.where({ chatId: threadId }).delete();
    });
  },
  generateTitle: () => Promise.resolve(new ReadableStream()),
  fetch: async (threadId) => {
    const row = await db.chats.get(threadId);
    if (!row) throw new Error(`Thread not found: ${threadId}`);
    return toMetadata(row);
  },
  unstable_Provider: PerThreadAdapters,
};
```

- [ ] **Step 2: Type-check + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: clean for the new file. chat-surface.tsx still fails (Task 5).

- [ ] **Step 3: Commit Tasks 3 + 4 together**

```bash
git add lib/persistence/use-history-adapter.ts lib/persistence/thread-list-adapter.ts
git add -u lib/persistence/history-adapter.ts  # records the deletion
git commit -m "$(cat <<'EOF'
feat(persistence): Dexie-backed RemoteThreadListAdapter for multi-chat

Replaces the static single-thread adapter from Plan 4 with one that
reads/writes Dexie's chats + messages tables. The per-thread history
adapter is mounted via the canonical unstable_Provider pattern (lifted
from useAssistantCloudThreadHistoryAdapter) so it reads the active
remoteId dynamically — making it work across thread switches.
EOF
)"
```

---

## Task 5: Wire chat-surface to dynamic threadId

**Files:**
- Modify: `components/chat/chat-surface.tsx`
- Modify: `lib/persistence/db.ts` — remove `DEFAULT_CHAT_ID` export

- [ ] **Step 1: Update chat-surface.tsx**

```tsx
// components/chat/chat-surface.tsx
"use client";

import {
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { useEffect, useState } from "react";
import { Thread } from "@/components/assistant-ui/thread";
import { db } from "@/lib/persistence/db";
import { dexieThreadListAdapter } from "@/lib/persistence/thread-list-adapter";
import { ChatListDrawer } from "./chat-list-drawer";
import { ShowBoardToolUI } from "./show-board-tool-ui";

// History adapter is no longer passed here — the thread-list adapter's
// unstable_Provider injects a per-thread one via RuntimeAdapterProvider.
const useChessRuntime = () =>
  useChatRuntime({
    adapters: { attachments: new SimpleImageAttachmentAdapter() },
  });

export const ChatSurface = (): React.JSX.Element => {
  // Active thread. Starts undefined while we look up the most recent
  // chat from Dexie; if there is none, stays undefined and the user's
  // first message triggers `initialize()` which creates the row.
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const row = await db.chats.orderBy("updatedAt").reverse().first();
      if (cancelled) return;
      if (row) setThreadId(row.id);
      setBootstrapped(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runtime = useRemoteThreadListRuntime({
    adapter: dexieThreadListAdapter,
    threadId,
    runtimeHook: useChessRuntime,
  });

  // Avoid a flash of empty thread while we're looking up the most-recent
  // chat. The bootstrap is one Dexie read — typically <50ms.
  if (!bootstrapped) return <main className="min-h-dvh" />;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ShowBoardToolUI />
      <main className="flex min-h-dvh flex-col pb-[env(safe-area-inset-bottom)]">
        <ChatListDrawer currentThreadId={threadId} onSelect={setThreadId} />
        <Thread />
      </main>
    </AssistantRuntimeProvider>
  );
};
```

- [ ] **Step 2: Remove `DEFAULT_CHAT_ID` from db.ts**

```ts
// In lib/persistence/db.ts, delete the line:
// export const DEFAULT_CHAT_ID = "@default";
```

- [ ] **Step 3: Type-check + lint (chat-list-drawer.tsx doesn't exist yet — Task 6)**

Skip — chat-surface imports ChatListDrawer which doesn't exist. Move directly to Task 6.

---

## Task 6: Chat list Drawer

**Files:**
- Create: `components/chat/chat-list-drawer.tsx`

- [ ] **Step 1: Write the drawer**

```tsx
// components/chat/chat-list-drawer.tsx
"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { nanoid } from "nanoid";
import { MenuIcon, PlusIcon, Trash2Icon } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/persistence/db";
import { dexieThreadListAdapter } from "@/lib/persistence/thread-list-adapter";

interface ChatListDrawerProps {
  readonly currentThreadId: string | undefined;
  readonly onSelect: (threadId: string | undefined) => void;
}

const formatDate = (ms: number): string => {
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export const ChatListDrawer = ({
  currentThreadId,
  onSelect,
}: ChatListDrawerProps): React.JSX.Element => {
  const chats = useLiveQuery(
    () => db.chats.orderBy("updatedAt").reverse().toArray(),
    [],
    [],
  );

  const newChat = async () => {
    const id = nanoid();
    await dexieThreadListAdapter.initialize(id);
    onSelect(id);
  };

  const deleteChat = async (id: string) => {
    await dexieThreadListAdapter.delete(id);
    if (currentThreadId === id) {
      const next = await db.chats.orderBy("updatedAt").reverse().first();
      onSelect(next?.id);
    }
  };

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-[env(safe-area-inset-top)] left-2 z-10"
          aria-label="Open chat list"
        >
          <MenuIcon className="size-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="flex items-center justify-between">
          <DrawerTitle>Chats</DrawerTitle>
          <DrawerClose asChild>
            <Button size="sm" onClick={() => void newChat()}>
              <PlusIcon className="mr-1 size-4" />
              New chat
            </Button>
          </DrawerClose>
        </DrawerHeader>
        <ul className="max-h-[60vh] overflow-y-auto px-4 pb-6">
          {chats.length === 0 ? (
            <li className="text-muted-foreground py-6 text-center text-sm">
              No chats yet. Tap "New chat" to start.
            </li>
          ) : (
            chats.map((c) => (
              <li
                key={c.id}
                className={
                  "flex items-center gap-2 rounded-md px-2 py-3 " +
                  (c.id === currentThreadId ? "bg-accent" : "hover:bg-accent/50")
                }
              >
                <DrawerClose asChild>
                  <button
                    type="button"
                    className="flex flex-1 flex-col items-start text-left"
                    onClick={() => onSelect(c.id)}
                  >
                    <span className="line-clamp-1 text-sm font-medium">{c.title}</span>
                    <span className="text-muted-foreground text-xs">{formatDate(c.updatedAt)}</span>
                  </button>
                </DrawerClose>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${c.title}`}
                  onClick={() => void deleteChat(c.id)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </li>
            ))
          )}
        </ul>
      </DrawerContent>
    </Drawer>
  );
};
```

- [ ] **Step 2: Install dexie-react-hooks**

```bash
pnpm add dexie-react-hooks
```

- [ ] **Step 3: Pipeline check**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

Fix anything that flags. Common issues:
- `Trash2Icon` import path (lucide-react)
- Generated drawer.tsx might re-export differently — check `components/ui/drawer.tsx` for exact exports

- [ ] **Step 4: Commit Tasks 5 + 6**

```bash
git add components/chat/chat-surface.tsx components/chat/chat-list-drawer.tsx lib/persistence/db.ts package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(chat): multi-chat Drawer with new-chat / switch / delete

ChatSurface now manages an active threadId (initialised from the
most-recent chat row in Dexie). vaul Drawer triggered by a top-left
menu button lists all chats (reactive via dexie-react-hooks) with
per-row delete and a New Chat action.
EOF
)"
```

---

## Task 7: Auto-title from first user message

**Files:**
- Modify: `lib/persistence/use-history-adapter.ts`

- [ ] **Step 1: After successful `append`, if the appended item is the first user message in this chat, set the chat's title to the first 60 chars of the user message's text content**

Update `append` to read the chat, decide whether to set title:

```ts
async append(item) {
  const chatId = adapter.currentChatId();
  if (!chatId) return;
  const row: MessageRow = {
    id: fmt.getId(item.message),
    chatId,
    parent_id: item.parentId,
    format: fmt.format,
    content: fmt.encode(item),
    createdAt: Date.now(),
  };
  await db.transaction("rw", db.messages, db.chats, async () => {
    await db.messages.put(row);

    // Title from first user message (only if chat is still untitled).
    const chat = await db.chats.get(chatId);
    const isUserMessage =
      // SAFE: assistant-ui's UIMessage shape — duck-typed.
      (item.message as { role?: string }).role === "user";
    const isUntitled = chat?.title === "New chat";
    if (isUntitled && isUserMessage) {
      const text = extractFirstTextPart(item.message);
      if (text) {
        const title = text.slice(0, 60).trim() || "Chat";
        await db.chats.update(chatId, { title, updatedAt: row.createdAt });
        return;
      }
    }
    await db.chats.update(chatId, { updatedAt: row.createdAt });
  });
},
```

Add the helper:

```ts
// Find the first text part of a UIMessage-like object. Returns
// undefined if the message has no text content (e.g. image-only).
function extractFirstTextPart(msg: unknown): string | undefined {
  if (!msg || typeof msg !== "object") return undefined;
  const parts = (msg as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return undefined;
  for (const p of parts) {
    if (p && typeof p === "object" && (p as { type?: string }).type === "text") {
      const text = (p as { text?: unknown }).text;
      if (typeof text === "string" && text.length > 0) return text;
    }
  }
  return undefined;
}
```

- [ ] **Step 2: Pipeline + commit**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
git add lib/persistence/use-history-adapter.ts
git commit -m "feat(persistence): auto-title chat from first user text message"
```

---

## Task 8: Local smoke

**Files:** none

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Manual browser checks**

Open `http://localhost:3000` and verify in order:

1. **Existing data migrates.** If your dev Dexie already had `@default` messages from Plan 4, the v2 upgrade should adopt them. After mount: menu icon top-left → tap → Drawer shows "Chat" with the right date. Tap it → past messages reload.
2. **New chat flow.** Open Drawer → tap "New chat" → Drawer closes, thread becomes empty. Send "test 1". After response, open Drawer → see a new entry titled "test 1" (or however the message starts).
3. **Switching.** Open Drawer → tap an older chat → its messages reload. Send a new message in it. Reopen Drawer → that chat's `updatedAt` is now most recent.
4. **Deletion.** Open Drawer → tap the trash icon next to a chat. Confirm it disappears from the list. If you deleted the active chat, the next-most-recent chat becomes active (or the thread is empty if none remain).
5. **Refresh persists.** Hard-refresh. The chat you were viewing should reload with its history. Open Drawer → all chats still there.

If anything's broken, debug locally and fix-commit before pushing.

- [ ] **Step 3: Stop dev server (no commit)**

---

## Task 9: Deploy + production smoke

**Files:** none

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Wait for Vercel**

```bash
until vercel ls chess-screenshot-analyzer --prod 2>&1 | head -4 | tail -1 | grep -q "● Ready"; do sleep 10; done
```

- [ ] **Step 3: HTTP smoke (page renders, /api/chat unchanged)**

```bash
PROD="https://chess-screenshot-analyzer-two.vercel.app"
curl -sI "$PROD/" | head -1
curl -s -X POST "$PROD/api/chat" \
  -H 'content-type: application/json' \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"hi"}]}]}' \
  --max-time 30 -w '\nHTTP %{http_code}\n' | head -c 300
```

Expected: HTML 200, /api/chat streams.

- [ ] **Step 4: iPhone test (Mark)**

Open the production URL on iPhone:

1. Menu button top-left → Drawer slides up, shows existing chats (or empty state).
2. Tap "New chat" → fresh thread.
3. Paste a chess screenshot → assistant responds with board (Plan 3 path).
4. Open Drawer → confirm the new chat appears with a title from your first message.
5. Tap an older chat → its history loads.
6. Delete a chat (trash icon) → confirm it's gone.
7. Force-quit Safari/PWA → reopen → most-recent chat should auto-load.

---

## Task 10: Close out — CLAUDE.md + final commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update execution-state block**

Replace the Plan 5 line with:

```
- **Plan 5 (multi-chat list) — SHIPPED.** Dexie v2 schema (chats + messages); Dexie-backed `RemoteThreadListAdapter` with `unstable_Provider` injecting a per-thread history adapter via `RuntimeAdapterProvider`. vaul `Drawer` (via shadcn) for the chat list; new-chat creates a row via `initialize()`, per-row delete cascades to messages. Auto-title is first 60 chars of first user message.
- **Next plan:** Slice 6 — Interactive tools (`showOptions`, `editPosition`). Plan document not yet written.
```

- [ ] **Step 2: Commit + push**

```bash
git add CLAUDE.md
git commit -m "docs: mark Plan 5 complete; resume marker → Slice 6"
git push origin main
```

---

## Done

End state:
- Multiple persisted chats, switchable via a Drawer.
- New chats auto-create a row in `chats` and auto-title from first user message.
- Delete cascades messages.
- History adapter is per-thread (canonical assistant-ui pattern, ready for cloud sync later if we add it).
- iOS PWA + Safari standalone still gets fresh content on reopen (Plan 7 will fix true stale-cache later).

Plan 6 next: interactive tools (`showOptions` for tappable chips, `editPosition` for the editable-board Drawer).
