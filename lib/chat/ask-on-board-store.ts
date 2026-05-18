"use client";

import { useSyncExternalStore } from "react";
import type { AskOnBoardArgs, AskOnBoardResult } from "@/lib/agent/ask-on-board-types";

// Module-level state — there is exactly one pending askOnBoard at a time
// (the agent loop pauses after a human-tool call). React's
// useSyncExternalStore handles re-renders.

export interface PendingAsk {
  readonly args: AskOnBoardArgs;
  readonly addResult: (result: AskOnBoardResult) => void;
}

let pending: PendingAsk | null = null;
const listeners = new Set<() => void>();

const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const getSnapshot = (): PendingAsk | null => pending;

const getServerSnapshot = (): PendingAsk | null => null;

export const useAskOnBoard = (): PendingAsk | null =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

export const setPendingAsk = (next: PendingAsk | null): void => {
  pending = next;
  listeners.forEach((l) => {
    l();
  });
};
