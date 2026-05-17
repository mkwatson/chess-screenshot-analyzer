"use client";

import {
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
  useRemoteThreadListRuntime,
  type RemoteThreadListAdapter,
} from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { historyAdapter } from "@/lib/persistence/history-adapter";
import { DEFAULT_CHAT_ID } from "@/lib/persistence/db";
import { ShowBoardToolUI } from "./show-board-tool-ui";

// `useRemoteThreadListRuntime` is the canonical persistence entry point —
// even for single-chat. assistant-ui's history load is gated on a
// thread-list `remoteId` (see @assistant-ui/react-ai-sdk's useExternalHistory:
// the load effect short-circuits when `threadListItem.remoteId` is falsy).
// So we need the thread-list adapter's `list()` to surface our default chat
// with a non-null remoteId on every mount — otherwise the runtime treats it
// as a fresh local thread and load never fires.
//
// InMemoryThreadListAdapter would also work *after* the user sends their
// first message of a session (initialize() assigns a remoteId then), but
// page refresh resets the in-memory list to empty. A static list of one
// item with `remoteId: DEFAULT_CHAT_ID` fixes that.
//
// Plan 5 will replace this with a Dexie-backed adapter that lists multiple
// chats (and tracks their remoteIds / titles).
const singleChatAdapter: RemoteThreadListAdapter = {
  list: () =>
    Promise.resolve({
      threads: [{ status: "regular", remoteId: DEFAULT_CHAT_ID, title: "Coach" }],
    }),
  initialize: (threadId) => Promise.resolve({ remoteId: threadId, externalId: undefined }),
  rename: () => Promise.resolve(),
  archive: () => Promise.resolve(),
  unarchive: () => Promise.resolve(),
  delete: () => Promise.resolve(),
  generateTitle: () => Promise.resolve(new ReadableStream()),
  fetch: (id) => Promise.resolve({ status: "regular", remoteId: id, title: "Coach" }),
};
// Named to satisfy react-hooks/rules-of-hooks — assistant-ui calls this
// as a hook for each thread it activates.
const useChessRuntime = () =>
  useChatRuntime({
    adapters: {
      attachments: new SimpleImageAttachmentAdapter(),
      history: historyAdapter,
    },
  });

export const ChatSurface = (): React.JSX.Element => {
  const runtime = useRemoteThreadListRuntime({
    adapter: singleChatAdapter,
    threadId: DEFAULT_CHAT_ID,
    runtimeHook: useChessRuntime,
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
