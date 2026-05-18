"use client";

import { useEffect, useRef } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { DrawShape } from "chessground/draw";

// ES-module CSS imports — colocated with the component so any consumer of
// <Board /> picks up the styles. Vitest runs with `css: false`, so these
// imports are no-ops during tests but bundle correctly via Next.js.
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";

export type ArrowBrush = "green" | "red" | "blue" | "yellow";

export interface BoardArrow {
  orig: string;
  dest: string;
  brush: ArrowBrush;
}

export interface BoardProps {
  fen: string;
  orientation?: "white" | "black";
  viewOnly?: boolean;
  arrows?: readonly BoardArrow[];
}

// Brush palette matching chessground's defaults; defined here so we own the
// arrow color contract independent of upstream tweaks.
const DEFAULT_BRUSHES = {
  green: { key: "g", color: "#15781B", opacity: 1, lineWidth: 10 },
  red: { key: "r", color: "#882020", opacity: 1, lineWidth: 10 },
  blue: { key: "b", color: "#003088", opacity: 1, lineWidth: 10 },
  yellow: { key: "y", color: "#e68f00", opacity: 1, lineWidth: 10 },
} as const;

// `Key` is `'a0' | ${File}${Rank}` in chessground's types. We accept plain
// strings at the BoardArrow boundary (callers shouldn't have to import
// chessground's type), then cast once here. The chess engine guarantees
// well-formed squares, so this is safe.
type CgKey = DrawShape["orig"];

function toShapes(arrows: readonly BoardArrow[] | undefined): DrawShape[] {
  if (!arrows) return [];
  return arrows.map(
    (a): DrawShape => ({
      orig: a.orig as CgKey,
      dest: a.dest as CgKey,
      brush: a.brush,
    }),
  );
}

// Callers MUST pass a chessops-legal FEN. Zod refinements on tool args
// are stripped at the JSON-Schema boundary that goes to the model, so any
// site rendering a board from model-emitted args must `parseFen` first
// and surface its own fallback UI on failure — chessground silently
// falls back to the starting position on invalid input, which is exactly
// how Plan 5 hid a real bug for hours.
export function Board({ fen, orientation = "white", viewOnly = true, arrows }: BoardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<Api | null>(null);

  // Mount once: instantiate chessground onto the host div. Chessground manages
  // its own Snabbdom-driven DOM inside the host; React must not touch it.
  // The reconciliation effect below handles all subsequent prop changes, so
  // the empty deps array is intentional — not a missed dep.
  useEffect(() => {
    if (!hostRef.current) return;
    const initialConfig: Config = {
      fen,
      orientation,
      viewOnly,
      coordinates: false,
      drawable: {
        enabled: true,
        visible: true,
        brushes: DEFAULT_BRUSHES,
      },
    };
    const api = Chessground(hostRef.current, initialConfig);
    api.setAutoShapes(toShapes(arrows));
    apiRef.current = api;
    return () => {
      api.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once; see comment above
  }, []);

  // Reconcile on prop change: push fen/orientation/viewOnly via api.set, and
  // arrows via api.setAutoShapes (auto shapes are wiped/redrawn each call).
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.set({ fen, orientation, viewOnly });
    api.setAutoShapes(toShapes(arrows));
  }, [fen, orientation, viewOnly, arrows]);

  return (
    <div className="aspect-square w-full max-w-[min(85vw,420px,45dvh)]">
      <div ref={hostRef} className="h-full w-full touch-none" />
    </div>
  );
}
