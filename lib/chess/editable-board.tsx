"use client";

import { useEffect, useRef } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import { parseFen } from "chessops/fen";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";

export interface EditableBoardProps {
  readonly fen: string;
  readonly turn: "white" | "black";
  readonly onChange: (fen: string) => void;
}

// Edit-mode board. Drag-from-existing only — no palette in v0
// (see Plan 6 scope notes). chessground's `movable.free=true` allows
// any piece to land on any square; we reconstruct the FEN from the
// API's `getFen()` after each move, then notify the parent via onChange.
export function EditableBoard({ fen, turn, onChange }: EditableBoardProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<Api | null>(null);

  // Mount-once useEffect captures props lexically — but `turn` and `onChange`
  // can change as the user toggles side-to-move. Keep refs in sync so the
  // chessground `events.change` callback always reads the latest values.
  // (Caught in review; without this the callback emits FENs with the stale
  // side-to-move after a toggle.)
  const turnRef = useRef(turn);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    turnRef.current = turn;
    onChangeRef.current = onChange;
  });

  // Caller is responsible for passing a chessops-legal FEN
  // (see lib/chess/board.tsx comment for context). If the model emits
  // an illegal one we'd have rejected it upstream in edit-position-tool-ui.
  useEffect(() => {
    if (!hostRef.current) return;
    const initialConfig: Config = {
      fen,
      orientation: turn,
      movable: { free: true, color: "both", showDests: false },
      draggable: { enabled: true },
      coordinates: true,
      events: {
        change: () => {
          const api = apiRef.current;
          if (!api) return;
          // chessground's getFen() returns the position fragment only —
          // no side-to-move/castling/en-passant/halfmove/fullmove. Append
          // a minimal tail using the LATEST `turn` (via ref, see above).
          // Castling rights `-` because we can't infer them from a position
          // alone; chessops accepts `-` cleanly.
          const positionOnly = api.getFen();
          const combined = `${positionOnly} ${turnRef.current === "white" ? "w" : "b"} - - 0 1`;
          // Only emit when chessops accepts — otherwise the FEN is mid-edit
          // (e.g. user dragged a piece into limbo for a frame). Caller
          // disables Confirm based on parseability.
          if (parseFen(combined).isOk) onChangeRef.current(combined);
        },
      },
    };
    const api = Chessground(hostRef.current, initialConfig);
    apiRef.current = api;
    return () => {
      api.destroy();
      apiRef.current = null;
    };
    // Mount once — orientation/fen changes from outside are not expected
    // mid-edit. If the parent wants to reset, it can remount via key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="aspect-square w-full max-w-[min(85vw,420px)]">
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}

// Helper for callers: produce a fresh FEN from an existing one with a
// new side-to-move. Used by the toggle in the edit Drawer.
export const withSideToMove = (fen: string, turn: "white" | "black"): string => {
  const parts = fen.split(" ");
  if (parts.length < 6) return fen;
  parts[1] = turn === "white" ? "w" : "b";
  return parts.join(" ");
};
