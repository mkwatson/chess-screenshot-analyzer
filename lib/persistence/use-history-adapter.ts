"use client";

import { useState } from "react";
import { useAui } from "@assistant-ui/react";
import type {
  GenericThreadHistoryAdapter,
  MessageFormatAdapter,
  MessageStorageEntry,
  ThreadHistoryAdapter,
} from "@assistant-ui/react";
import { db, type MessageRow } from "./db";

// Canonical pattern lifted from `useAssistantCloudThreadHistoryAdapter`:
// the adapter reads the active thread's remoteId on every load/append
// via `aui.threadListItem().getState().remoteId`. That makes one adapter
// instance usable across thread switches without re-creating it.
//
// Mount this hook inside the thread-list adapter's `unstable_Provider`
// and wrap children with `RuntimeAdapterProvider({ adapters: { history } })`
// so assistant-ui's `useExternalHistory` picks it up.
class DexieThreadHistoryAdapter implements ThreadHistoryAdapter {
  constructor(private readonly aui: ReturnType<typeof useAui>) {}

  private currentChatId(): string | undefined {
    return this.aui.threadListItem().getState().remoteId ?? undefined;
  }

  // Required by the type but unused on the AI SDK path (withFormat
  // supersedes both per assistant-ui docs).
  load = (): Promise<{ headId: null; messages: [] }> =>
    Promise.resolve({ headId: null, messages: [] });
  append = (): Promise<void> => Promise.resolve();

  // Arrow property captures `this` without a local alias — avoids
  // @typescript-eslint/no-this-alias while keeping the generic signature.
  withFormat = <TMessage, TStorageFormat extends Record<string, unknown>>(
    fmt: MessageFormatAdapter<TMessage, TStorageFormat>,
  ): GenericThreadHistoryAdapter<TMessage> => ({
    load: async () => {
      const chatId = this.currentChatId();
      if (chatId === undefined) return { messages: [] };
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
    append: async (item) => {
      // initialize() ensures a chat row exists and sets remoteId before
      // the first message is persisted. This mirrors the cloud adapter
      // pattern where remoteId is guaranteed after initialize() resolves.
      const { remoteId: chatId } = await this.aui.threadListItem().initialize();
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
  });
}

export const useHistoryAdapter = (): ThreadHistoryAdapter => {
  const aui = useAui();
  const [adapter] = useState(() => new DexieThreadHistoryAdapter(aui));
  return adapter;
};
