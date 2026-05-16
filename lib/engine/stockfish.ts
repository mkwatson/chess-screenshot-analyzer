import { Stockfish, type StockfishInfo } from "@se-oss/stockfish";
import { AnalyzeInputSchema, type AnalyzeOutput } from "./types";

// Module-scope warm singleton. On Vercel Fluid Compute, this engine persists
// across requests served by the same instance. In local dev (next dev) and
// vitest, it persists for the lifetime of the Node process.
//
// Concurrency: requests within one instance are serialized via `inFlight`.
// Vercel scales by spawning instances; not by pooling within one.
let enginePromise: Promise<Stockfish> | null = null;
let inFlight: Promise<unknown> = Promise.resolve();

function getEngine(): Promise<Stockfish> {
  enginePromise ??= (async () => {
    const e = new Stockfish();
    await e.waitReady();
    await e.setOptions({ Threads: 1, Hash: 64, UCI_ShowWDL: true });
    return e;
  })();
  return enginePromise;
}

const TIMEOUT_MS = 10_000;

export async function analyzePosition(rawInput: unknown): Promise<AnalyzeOutput> {
  // Defensive runtime validation (the API route validates separately,
  // but unit tests + future direct callers depend on the same contract).
  const parsed = AnalyzeInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_position",
      detail: parsed.error.message,
    };
  }
  const { fen, depth } = parsed.data;

  const engine = await getEngine();

  const run = inFlight.then(async () => {
    let lastDepth = 0;
    let lastCp: number | null = null;

    const infoListener = (info: StockfishInfo): void => {
      if (typeof info.depth === "number") lastDepth = info.depth;
      if (info.score?.type === "cp" && typeof info.score.value === "number") {
        lastCp = info.score.value;
      }
    };
    engine.on("info", infoListener);

    let bestMove = "";
    try {
      const result = await Promise.race([
        engine.analyze(fen, depth, 1),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("engine_timeout")), TIMEOUT_MS),
        ),
      ]);
      bestMove = result.bestmove;
    } finally {
      engine.off("info", infoListener);
    }

    return { bestMove, depth: lastDepth, evalCp: lastCp };
  });

  inFlight = run.catch(() => {
    // Swallow — the awaiter below re-throws via `await run` for proper handling.
  });

  try {
    const { bestMove, depth: reachedDepth, evalCp } = await run;
    if (!bestMove) {
      return { ok: false, reason: "engine_error", detail: "No bestmove" };
    }
    return {
      ok: true,
      data: {
        bestMove,
        evalCp,
        depth: reachedDepth || depth,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message === "engine_timeout") {
      return { ok: false, reason: "engine_timeout" };
    }
    return { ok: false, reason: "engine_error", detail: message };
  }
}
