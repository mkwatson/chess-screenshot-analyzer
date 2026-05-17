import Dexie, { type Table } from "dexie";

// Plan 4 stores one message per row. `chatId` is hardcoded to "@default"
// (single-chat); Plan 5 will introduce the chats table + chatId per row.
//
// Field names `parent_id`, `format`, `content` (snake_case for parent_id)
// mirror assistant-ui's `MessageStorageEntry<TPayload>` exactly so a row
// can be handed straight to `fmt.decode` without a wrapper. `chatId` and
// `createdAt` are our own index columns.
export interface MessageRow {
  readonly id: string;
  readonly chatId: string;
  readonly parent_id: string | null;
  readonly format: string;
  // Opaque JSON payload — encoded by assistant-ui's format helper. We never
  // inspect it; it round-trips through the adapter's encode/decode pair.
  readonly content: Record<string, unknown>;
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
