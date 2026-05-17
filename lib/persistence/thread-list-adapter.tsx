"use client";

import { useMemo } from "react";
import { RuntimeAdapterProvider } from "@assistant-ui/react";
import type { RemoteThreadListAdapter } from "@assistant-ui/react";
import { db, type ChatRow } from "./db";
import { useHistoryAdapter } from "./use-history-adapter";

// Shape matches RemoteThreadMetadata from @assistant-ui/core (not directly
// re-exported by @assistant-ui/react). TypeScript infers via the adapter type.
const toMetadata = (row: ChatRow) => ({
  status: "regular" as const,
  remoteId: row.id,
  title: row.title,
});

// Per-thread context — assistant-ui mounts this around each active
// thread's tree. We use it to inject a thread-aware history adapter
// via RuntimeAdapterProvider so `useExternalHistory` picks it up.
const PerThreadAdapters = ({ children }: { children?: React.ReactNode }) => {
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
    // assistant-ui generates `threadId` (a local UUID) before any remote
    // exists. We use it as the chat row's permanent id.
    const now = Date.now();
    await db.chats.put({
      id: threadId,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
    });
    return { remoteId: threadId, externalId: undefined };
  },
  rename: async (remoteId, newTitle) => {
    await db.chats.update(remoteId, { title: newTitle });
  },
  archive: () => Promise.resolve(),
  unarchive: () => Promise.resolve(),
  delete: async (remoteId) => {
    await db.transaction("rw", db.chats, db.messages, async () => {
      await db.chats.delete(remoteId);
      await db.messages.where({ chatId: remoteId }).delete();
    });
  },
  // Auto-title generation is handled in Task 7 (Plan 5). Return an
  // empty stream for now so assistant-ui's title-update path is a no-op.
  generateTitle: () => Promise.resolve(new ReadableStream()),
  fetch: async (threadId) => {
    const row = await db.chats.get(threadId);
    if (!row) throw new Error(`Thread not found: ${threadId}`);
    return toMetadata(row);
  },
  unstable_Provider: PerThreadAdapters,
};
