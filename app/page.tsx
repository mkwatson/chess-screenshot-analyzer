"use client";

import { useState } from "react";
import { Board, type BoardArrow } from "@/lib/chess/board";
import { Button } from "@/components/ui/button";
import type { AnalyzeOutput } from "@/lib/engine/types";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function Home(): React.JSX.Element {
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function analyze(): Promise<void> {
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fen: STARTING_FEN, depth: 14 }),
      });
      const data = (await res.json()) as AnalyzeOutput;
      if (!data.ok) {
        setStatus("error");
        setErrorMsg(data.reason);
        return;
      }
      const move = data.data.bestMove;
      const orig = move.slice(0, 2);
      const dest = move.slice(2, 4);
      setArrows([{ orig, dest, brush: "green" }]);
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 pb-[env(safe-area-inset-bottom)]">
      <h1 className="text-2xl font-semibold">Chess Screenshot Analyzer</h1>
      <Board fen={STARTING_FEN} arrows={arrows} />
      <Button onClick={() => void analyze()} disabled={status === "loading"}>
        {status === "loading" ? "Analyzing..." : "Analyze"}
      </Button>
      {status === "error" ? <p className="text-sm text-red-500">Error: {errorMsg}</p> : null}
    </main>
  );
}
