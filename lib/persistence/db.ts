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
    // v1: messages table only (Plan 4).
    this.version(1).stores({
      messages: "id, chatId, [chatId+createdAt]",
    });
    // v2: add chats table + adopt any legacy @default messages into
    // a single auto-created chat row (lossless migration).
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

// Kept temporarily so existing imports (Plan 4 history-adapter +
// chat-surface) continue to compile. Task 5 of Plan 5 removes this.
export const DEFAULT_CHAT_ID = "@default";
