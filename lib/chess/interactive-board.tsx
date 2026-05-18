"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { DrawShape } from "chessground/draw";
import type { Key } from "chessground/types";
import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";
import { chessgroundDests } from "chessops/compat";
import { Button } from "@/components/ui/button";
import type {
  AcceptMode,
  AnnotationArrow,
  AnnotationMove,
  AskOnBoardResult,
} from "@/lib/agent/ask-on-board-types";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";

export interface InteractiveBoardProps {
  readonly fen: string;
  readonly prompt: string;
  readonly accept: readonly AcceptMode[];
  readonly minTotal: number;
  readonly maxTotal: number | undefined;
  readonly onSubmit: (result: AskOnBoardResult) => void;
}

interface AnnotationState {
  readonly pieces: ReadonlySet<string>;
  readonly squares: ReadonlySet<string>;
  readonly arrows: readonly AnnotationArrow[];
  readonly moves: readonly AnnotationMove[];
}

const EMPTY: AnnotationState = {
  pieces: new Set(),
  squares: new Set(),
  arrows: [],
  moves: [],
};

const totalCount = (a: AnnotationState): number =>
  a.pieces.size + a.squares.size + a.arrows.length + a.moves.length;

const toggle = (set: ReadonlySet<string>, key: string): ReadonlySet<string> => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

// Build chessground autoShapes that visualise our local annotation state.
// Pieces → green circle. Squares → blue circle. (Arrows live in chessground's
// own drawable.shapes, so we don't duplicate them as autoShapes.)
const toAutoShapes = (a: AnnotationState): DrawShape[] => [
  ...Array.from(a.pieces).map((sq): DrawShape => ({ orig: sq as Key, brush: "green" })),
  ...Array.from(a.squares).map((sq): DrawShape => ({ orig: sq as Key, brush: "blue" })),
];

export function InteractiveBoard({
  fen,
  prompt,
  accept,
  minTotal,
  maxTotal,
  onSubmit,
}: InteractiveBoardProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<Api | null>(null);
  const [state, setState] = useState<AnnotationState>(EMPTY);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // Compute legal destinations once (FEN doesn't change inside one ask).
  const { turn, dests } = useMemo(() => {
    const setup = parseFen(fen).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();
    return {
      turn: pos.turn,
      dests: chessgroundDests(pos),
    };
  }, [fen]);

  const acceptSet = useMemo(() => new Set(accept), [accept]);
  const movesEnabled = acceptSet.has("move");
  const arrowsEnabled = acceptSet.has("arrow");
  const piecesEnabled = acceptSet.has("piece");
  const squaresEnabled = acceptSet.has("square");

  // Mount-once: instantiate chessground. Subsequent prop changes update
  // autoShapes via the reconciliation effect below.
  useEffect(() => {
    if (!hostRef.current) return;
    // Build drawable separately so the optional onChange handler is only
    // attached when arrows are enabled (avoids non-null assertion later).
    const drawable: NonNullable<Config["drawable"]> = arrowsEnabled
      ? {
          enabled: true,
          visible: true,
          onChange: (shapes) => {
            // Keep only "real" arrows (orig !== dest); chessground also emits
            // single-square circles when the user right-taps, which we ignore.
            const arrows = shapes
              .filter(
                (s): s is DrawShape & { dest: Key } => s.dest !== undefined && s.dest !== s.orig,
              )
              .map((s): AnnotationArrow => {
                const arrow: AnnotationArrow = { from: s.orig, to: s.dest };
                if (
                  s.brush === "green" ||
                  s.brush === "red" ||
                  s.brush === "blue" ||
                  s.brush === "yellow"
                ) {
                  return { ...arrow, color: s.brush };
                }
                return arrow;
              });
            const next = { ...stateRef.current, arrows };
            if (maxTotal !== undefined && totalCount(next) > maxTotal) return;
            setState(next);
          },
        }
      : { enabled: false, visible: true };
    const initialConfig: Config = {
      fen,
      orientation: turn === "white" ? "white" : "black",
      coordinates: false,
      viewOnly: false,
      selectable: { enabled: false },
      movable: movesEnabled
        ? {
            free: false,
            color: turn,
            dests,
            showDests: true,
          }
        : { free: false, dests: new Map(), showDests: false },
      draggable: { enabled: movesEnabled },
      drawable,
      events: {
        select: (key) => {
          if (!piecesEnabled && !squaresEnabled) return;
          const api = apiRef.current;
          if (!api) return;
          const piece = api.state.pieces.get(key);
          const next = piece
            ? piecesEnabled
              ? { ...stateRef.current, pieces: toggle(stateRef.current.pieces, key) }
              : null
            : squaresEnabled
              ? { ...stateRef.current, squares: toggle(stateRef.current.squares, key) }
              : null;
          if (next === null) return;
          if (maxTotal !== undefined && totalCount(next) > maxTotal) return;
          setState(next);
        },
        ...(movesEnabled
          ? {
              move: (orig: Key, dest: Key) => {
                const next = {
                  ...stateRef.current,
                  moves: [...stateRef.current.moves, { from: orig, to: dest }],
                };
                if (maxTotal !== undefined && totalCount(next) > maxTotal) return;
                setState(next);
              },
            }
          : {}),
      },
    };
    const api = Chessground(hostRef.current, initialConfig);
    apiRef.current = api;
    return () => {
      api.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; chessground reconciles via api.set
  }, []);

  // Reconcile autoShapes when state changes (pieces / squares).
  useEffect(() => {
    apiRef.current?.setAutoShapes(toAutoShapes(state));
  }, [state]);

  const count = totalCount(state);
  const canSubmit = count >= minTotal;

  const handleSubmit = (): void => {
    onSubmit({
      pieces: Array.from(state.pieces),
      squares: Array.from(state.squares),
      arrows: [...state.arrows],
      moves: [...state.moves],
    });
  };

  const handleClear = (): void => {
    setState(EMPTY);
    apiRef.current?.setShapes([]);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-sm">{prompt}</p>
      <div className="aspect-square w-full max-w-[min(85vw,420px,45dvh)]">
        <div ref={hostRef} className="h-full w-full touch-none" />
      </div>
      <div className="text-muted-foreground text-xs">
        {count}
        {maxTotal !== undefined ? `/${maxTotal}` : ""} selected
        {count < minTotal ? ` (need ${minTotal})` : ""}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleClear} disabled={count === 0}>
          Clear
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          Done
        </Button>
      </div>
    </div>
  );
}
