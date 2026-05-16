"use client";

import { AssistantRuntimeProvider, SimpleImageAttachmentAdapter } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { Thread } from "@/components/assistant-ui/thread";
import { ShowBoardToolUI } from "./show-board-tool-ui";

// The chat surface is the single user-facing entry point. It composes
// assistant-ui's headless runtime (talks to /api/chat — the default
// `api` value on AssistantChatTransport so no explicit api option is
// needed) with the styled Thread we own under components/assistant-ui/.
//
// ShowBoardToolUI is mounted inside the provider so the showBoard tool
// renders inline both on stream and during history replay (spec §5.3).
export const ChatSurface = (): React.JSX.Element => {
  const runtime = useChatRuntime({
    adapters: {
      attachments: new SimpleImageAttachmentAdapter(),
    },
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
