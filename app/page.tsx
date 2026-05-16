"use client";

import { useRef, useState } from "react";
import { Board, type BoardArrow } from "@/lib/chess/board";
import { Button } from "@/components/ui/button";
import type { AnalyzeOutput } from "@/lib/engine/types";
import type { ParseOutput } from "@/lib/vision/types";

type Phase = "empty" | "parsing" | "ready" | "analyzing" | "error";

async function fileToBase64(
  blob: Blob,
): Promise<{ base64: string; mimeType: "image/png" | "image/jpeg" | "image/webp" }> {
  const allowed = ["image/png", "image/jpeg", "image/webp"] as const;
  const mt = blob.type as (typeof allowed)[number];
  if (!allowed.includes(mt)) {
    throw new Error(`Unsupported image type: ${blob.type || "unknown"}`);
  }
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return { base64: btoa(bin), mimeType: mt };
}

export default function Home(): React.JSX.Element {
  const [fen, setFen] = useState<string | null>(null);
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const [phase, setPhase] = useState<Phase>("empty");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImage(blob: Blob): Promise<void> {
    setPhase("parsing");
    setErrorMsg(null);
    setArrows([]);
    try {
      const { base64, mimeType } = await fileToBase64(blob);
      const res = await fetch("/api/parse-screenshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = (await res.json()) as ParseOutput;
      if (!data.ok) {
        setPhase("error");
        setErrorMsg(data.reason + (data.detail ? `: ${data.detail}` : ""));
        return;
      }
      setFen(data.data.fen);
      setPhase("ready");
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function handlePasteClick(): Promise<void> {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            await handleImage(blob);
            return;
          }
        }
      }
      // No image in clipboard — open file picker as fallback.
      fileInputRef.current?.click();
    } catch {
      // Permission denied or clipboard unavailable — open file picker.
      fileInputRef.current?.click();
    }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    void handleImage(file);
  }

  async function analyze(): Promise<void> {
    if (!fen) return;
    setPhase("analyzing");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fen, depth: 14 }),
      });
      const data = (await res.json()) as AnalyzeOutput;
      if (!data.ok) {
        setPhase("error");
        setErrorMsg(data.reason);
        return;
      }
      const move = data.data.bestMove;
      setArrows([{ orig: move.slice(0, 2), dest: move.slice(2, 4), brush: "green" }]);
      setPhase("ready");
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 pb-[env(safe-area-inset-bottom)]">
      <h1 className="text-2xl font-semibold">Chess Screenshot Analyzer</h1>

      {fen ? <Board fen={fen} arrows={arrows} /> : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFilePick}
      />

      <div className="flex flex-col items-center gap-3">
        <Button
          onClick={() => void handlePasteClick()}
          disabled={phase === "parsing" || phase === "analyzing"}
        >
          {phase === "parsing"
            ? "Parsing…"
            : fen
              ? "Paste another position"
              : "Paste a chess position"}
        </Button>

        {fen ? (
          <Button
            variant="secondary"
            onClick={() => void analyze()}
            disabled={phase === "analyzing" || phase === "parsing"}
          >
            {phase === "analyzing" ? "Analyzing…" : "Analyze"}
          </Button>
        ) : null}
      </div>

      {phase === "error" && errorMsg ? (
        <p className="text-sm text-red-500">Error: {errorMsg}</p>
      ) : null}
    </main>
  );
}
