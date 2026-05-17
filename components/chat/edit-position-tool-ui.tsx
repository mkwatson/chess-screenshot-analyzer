"use client";

import { useState } from "react";
import { makeAssistantTool } from "@assistant-ui/react";
import { parseFen } from "chessops/fen";
import { z } from "zod";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { EditableBoard, withSideToMove } from "@/lib/chess/editable-board";
import { FenSchema } from "@/lib/engine/types";

const EditPositionArgsSchema = z.object({
  fen: FenSchema,
});

type EditPositionArgs = z.infer<typeof EditPositionArgsSchema>;

interface EditPositionResult {
  readonly fen: string;
}

// Human tool — opens a Drawer with the parsed position. The user drags
// pieces / flips side-to-move and Confirms. Result is the corrected FEN.
export const EditPositionToolUI = makeAssistantTool<EditPositionArgs, EditPositionResult>({
  toolName: "editPosition",
  type: "human",
  description:
    "Open an editable board so the user can correct a parsed position. ONLY call this when the user explicitly says the parsed board is wrong (or asks to edit it). Pass the current best-guess FEN as the starting point; the user adjusts and confirms. You receive the corrected FEN as the result and should redo your analysis with the new position.",
  parameters: EditPositionArgsSchema,
  render: ({ args, addResult, result }) => {
    // History-replay path: tool already resolved.
    if (result !== undefined) {
      return (
        <div className="text-muted-foreground my-2 text-xs">
          User confirmed the corrected position.
        </div>
      );
    }

    return <EditPositionDialog initialFen={args.fen} onConfirm={(fen) => addResult({ fen })} />;
  },
});

// Pulled out so we can use hooks. (makeAssistantTool's render is just a
// function; hooks need a real component for fast-refresh + StrictMode.)
function EditPositionDialog({
  initialFen,
  onConfirm,
}: {
  readonly initialFen: string;
  readonly onConfirm: (fen: string) => void;
}) {
  // The Drawer opens immediately when the tool renders, and stays open
  // until the user Confirms. `open` is controlled so we can dismiss on
  // confirm without unmounting via DrawerClose (which would race the
  // onConfirm call).
  const [open, setOpen] = useState(true);
  const [turn, setTurn] = useState<"white" | "black">(
    initialFen.split(" ")[1] === "b" ? "black" : "white",
  );
  const [currentFen, setCurrentFen] = useState(initialFen);

  const canConfirm = parseFen(currentFen).isOk;

  const handleConfirm = (): void => {
    setOpen(false);
    onConfirm(currentFen);
  };

  const handleBoardChange = (nextFen: string): void => {
    // EditableBoard emits position+turn; honor the current `turn` state
    // (board's events don't know about toggle state).
    setCurrentFen(withSideToMove(nextFen, turn));
  };

  const handleTurnToggle = (next: "white" | "black"): void => {
    setTurn(next);
    setCurrentFen(withSideToMove(currentFen, next));
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit position</DrawerTitle>
        </DrawerHeader>
        <div className="flex flex-col items-center gap-4 px-4">
          <EditableBoard fen={initialFen} turn={turn} onChange={handleBoardChange} />
          <div className="flex gap-2">
            <Button
              variant={turn === "white" ? "default" : "outline"}
              size="sm"
              onClick={() => handleTurnToggle("white")}
            >
              White to move
            </Button>
            <Button
              variant={turn === "black" ? "default" : "outline"}
              size="sm"
              onClick={() => handleTurnToggle("black")}
            >
              Black to move
            </Button>
          </div>
        </div>
        <DrawerFooter>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Confirm
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
