"use client";

import {
  AssistantRuntimeProvider,
  SimpleImageAttachmentAdapter,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { useEffect, useState } from "react";
import { Thread } from "@/components/assistant-ui/thread";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { db } from "@/lib/persistence/db";
import { dexieThreadListAdapter } from "@/lib/persistence/thread-list-adapter";
import { BoardStage } from "./board-stage";
import { ChatListDrawer } from "./chat-list-drawer";
import { EditPositionToolUI } from "./edit-position-tool-ui";
import { ShowBoardToolUI } from "./show-board-tool-ui";
import { ShowOptionsToolUI } from "./show-options-tool-ui";

// History adapter is no longer passed here — the thread-list adapter's
// unstable_Provider injects a per-thread one via RuntimeAdapterProvider.
const attachmentAdapter = new SimpleImageAttachmentAdapter();
const useChessRuntime = () =>
  useChatRuntime({
    adapters: { attachments: attachmentAdapter },
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

export const ChatSurface = (): React.JSX.Element => {
  // Active thread. Starts undefined while we look up the most recent
  // chat from Dexie; if there is none, stays undefined and the user's
  // first message triggers `initialize()` which creates the row.
  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [boardExpanded, setBoardExpanded] = useState(true);

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

  // Auto-collapse the board when the composer receives focus so the user
  // has more vertical space for typing. The aria-label on ComposerPrimitive.Input
  // is "Message input" (see thread.tsx), giving us a stable selector.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.getAttribute("aria-label") === "Message input") {
        setBoardExpanded(false);
      }
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
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
      <ShowOptionsToolUI />
      <EditPositionToolUI />
      <div className="flex h-dvh flex-col">
        <ChatListDrawer currentThreadId={threadId} onSelect={setThreadId} />
        <BoardStage expanded={boardExpanded} onExpandedChange={setBoardExpanded} />
        <main className="min-h-0 flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)]">
          <Thread />
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
};
