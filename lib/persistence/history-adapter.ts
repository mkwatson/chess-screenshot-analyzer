import type {
  GenericThreadHistoryAdapter,
  MessageFormatAdapter,
  MessageStorageEntry,
  ThreadHistoryAdapter,
} from "@assistant-ui/react";
import { db, DEFAULT_CHAT_ID } from "./db";

// assistant-ui's history adapter uses a `withFormat` wrapper so messages
// round-trip as AI SDK v6 UIMessage objects. The format helper handles
// encode/decode; we own the storage layer (Dexie).
//
// Plan 4 hardcodes chatId — single-chat. Plan 5 wires multiple chats.
export const historyAdapter: ThreadHistoryAdapter = {
  // Required by the type but unused by useChatRuntime — the withFormat
  // branch below supersedes both per the @assistant-ui/react-ai-sdk docs.
  load: () => Promise.resolve({ headId: null, messages: [] }),
  append: () => Promise.resolve(),

  withFormat<TMessage, TStorageFormat extends Record<string, unknown>>(
    fmt: MessageFormatAdapter<TMessage, TStorageFormat>,
  ): GenericThreadHistoryAdapter<TMessage> {
    return {
      async load() {
        const rows = await db.messages
          .where("[chatId+createdAt]")
          .between([DEFAULT_CHAT_ID, 0], [DEFAULT_CHAT_ID, Number.MAX_SAFE_INTEGER])
          .toArray();
        return {
          messages: rows.map((r) => {
            // Cast content to TStorageFormat — Dexie stores opaque JSON,
            // and assistant-ui's format adapter is the contract that knows
            // how to decode it. Boundary cast, contained to this single line.
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
        await db.messages.put({
          id: fmt.getId(item.message),
          chatId: DEFAULT_CHAT_ID,
          parent_id: item.parentId,
          format: fmt.format,
          content: fmt.encode(item),
          createdAt: Date.now(),
        });
      },
    };
  },
};
