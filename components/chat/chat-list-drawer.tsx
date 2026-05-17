"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { nanoid } from "nanoid";
import { MenuIcon, PlusIcon, Trash2Icon } from "lucide-react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/persistence/db";
import { dexieThreadListAdapter } from "@/lib/persistence/thread-list-adapter";

interface ChatListDrawerProps {
  readonly currentThreadId: string | undefined;
  readonly onSelect: (threadId: string | undefined) => void;
}

const formatDate = (ms: number): string => {
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

export const ChatListDrawer = ({
  currentThreadId,
  onSelect,
}: ChatListDrawerProps): React.JSX.Element => {
  // useLiveQuery initial value [] avoids a chats === undefined branch.
  const chats = useLiveQuery(() => db.chats.orderBy("updatedAt").reverse().toArray(), [], []) ?? [];

  const newChat = async (): Promise<void> => {
    const id = nanoid();
    await dexieThreadListAdapter.initialize(id);
    onSelect(id);
  };

  const deleteChat = async (id: string): Promise<void> => {
    await dexieThreadListAdapter.delete(id);
    if (currentThreadId === id) {
      const next = await db.chats.orderBy("updatedAt").reverse().first();
      onSelect(next?.id);
    }
  };

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-[env(safe-area-inset-top)] left-2 z-10"
          aria-label="Open chat list"
        >
          <MenuIcon className="size-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="flex items-center justify-between">
          <DrawerTitle>Chats</DrawerTitle>
          <DrawerClose asChild>
            <Button size="sm" onClick={() => void newChat()}>
              <PlusIcon className="mr-1 size-4" />
              New chat
            </Button>
          </DrawerClose>
        </DrawerHeader>
        <ul className="max-h-[60vh] overflow-y-auto px-4 pb-6">
          {chats.length === 0 ? (
            <li className="text-muted-foreground py-6 text-center text-sm">
              No chats yet. Tap &quot;New chat&quot; to start.
            </li>
          ) : (
            chats.map((c) => (
              <li
                key={c.id}
                className={
                  "flex items-center gap-2 rounded-md px-2 py-3 " +
                  (c.id === currentThreadId ? "bg-accent" : "hover:bg-accent/50")
                }
              >
                <DrawerClose asChild>
                  <button
                    type="button"
                    className="flex flex-1 flex-col items-start text-left"
                    onClick={() => onSelect(c.id)}
                  >
                    <span className="line-clamp-1 text-sm font-medium">{c.title}</span>
                    <span className="text-muted-foreground text-xs">{formatDate(c.updatedAt)}</span>
                  </button>
                </DrawerClose>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${c.title}`}
                  onClick={() => void deleteChat(c.id)}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </li>
            ))
          )}
        </ul>
      </DrawerContent>
    </Drawer>
  );
};
