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
          // no side-to-move/castling/en-passant/halfmove/fullmove. We
          // append a minimal-but-valid tail; chessops re-validates downstream.
          const positionOnly = api.getFen();
          // Combine into a full FEN with sensible defaults. Castling rights
          // `KQkq` are common (chessops will reject if e.g. king has moved
          // off home square, but we accept the false-negative here for v0).
          const combined = `${positionOnly} ${turn === "white" ? "w" : "b"} - - 0 1`;
          // Only emit when chessops accepts — otherwise the FEN is mid-edit
          // (e.g. user dragged a piece into limbo for a frame). Caller
          // disables Confirm based on parseability.
          if (parseFen(combined).isOk) onChange(combined);
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
