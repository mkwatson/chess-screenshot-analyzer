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
const attachmentAdapter = new SimpleImageAttachmentAdapter();
const useChessRuntime = () => useChatRuntime({ adapters: { attachments: attachmentAdapter } });

export const ChatSurface = (): React.JSX.Element => {
  // Active thread. Starts undefined while we look up the most recent
  // chat from Dexie; if there is none, stays undefined and the user's
  // first message triggers `initialize()` which creates the row.
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [bootstrapped, setBootstrapped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const row = await db.chats.orderBy("updatedAt").reverse().first();
      if (cancelled) return;
      if (row !== undefined) setThreadId(row.id);
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

  // Avoid a flash of empty thread while we look up the most-recent chat.
  // One Dexie read; typically <50ms.
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
