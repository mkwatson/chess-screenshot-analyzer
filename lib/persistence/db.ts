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
