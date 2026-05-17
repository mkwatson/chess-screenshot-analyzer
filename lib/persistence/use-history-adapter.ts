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

// Find the first non-empty text part of an assistant-ui UIMessage-like
// object. Returns undefined if there is none (image-only messages, etc.).
// Duck-typed because TMessage is generic at this layer.
const extractFirstTextPart = (msg: unknown): string | undefined => {
  if (msg === null || typeof msg !== "object") return undefined;
  const parts = (msg as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return undefined;
  for (const p of parts) {
    if (p !== null && typeof p === "object") {
      const part = p as { type?: unknown; text?: unknown };
      if (part.type === "text" && typeof part.text === "string" && part.text.length > 0) {
        return part.text;
      }
    }
  }
  return undefined;
};

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

        // Auto-title from the first user message's text part, but only
        // while the chat is still "New chat" (a user rename later wins).
        const isUserMessage = (item.message as { role?: unknown }).role === "user";
        if (isUserMessage) {
          const chat = await db.chats.get(chatId);
          if (chat?.title === "New chat") {
            const text = extractFirstTextPart(item.message);
            if (text !== undefined) {
              const title = text.slice(0, 60).trim();
              if (title.length > 0) {
                await db.chats.update(chatId, { title, updatedAt: row.createdAt });
                return;
              }
            }
          }
        }
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
