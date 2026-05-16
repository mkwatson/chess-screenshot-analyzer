# Plan 1 — Static Board + Engine Call

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** End-to-end proof of the product stack: a hardcoded chess position renders on the phone, tapping a button POSTs to a Vercel function, Stockfish (WASM, server-side, warm singleton) returns the best move, the board re-renders with an arrow showing the move. No AI, no vision, no chat. First user-visible feature on top of Plan 0's rails.

**Architecture:** chessground (Lichess's renderer) inside a thin React wrapper; chessops for FEN parsing and helpers; `@se-oss/stockfish` (Stockfish 17.1 WASM) on the Vercel function side as a module-scope warm singleton; Zod-validated POST API at `/api/analyze`; plain `fetch` from the client (no SSE, no streaming — Plan 3 introduces those when the agent arrives).

**Tech stack:** chessground, chessops, `@se-oss/stockfish`, Zod, Vitest (test framework, introduced in this plan), all on Next.js 16 + Vercel.

---

## Reference docs

- `AGENTS.md` (project-root) — read first; contains hard rules (no secrets), code conventions, and stack summary
- Spec: `docs/superpowers/specs/2026-05-16-chess-screenshot-analyzer-design.md`
  - Section 4.1 — `analyzePosition` tool shape (Plan 1 implements a tiny subset; the full tool surface comes later)
  - Section 7.2 — Stockfish engine setup pattern (warm singleton, serialized requests, depth/MultiPV)
  - Appendix C — code-quality + type-driven-development principles enforced here

---

## File structure (created or modified)

**Server:**
- Create: `lib/engine/types.ts` — Zod schemas: `FenSchema`, `AnalyzeInputSchema`, `AnalyzeOutputSchema`
- Create: `lib/engine/stockfish.ts` — warm engine singleton, `analyzePosition({ fen, depth })` function
- Create: `lib/engine/stockfish.test.ts` — vitest spec
- Create: `app/api/analyze/route.ts` — POST handler
- Create: `app/api/analyze/route.test.ts` — vitest spec for the handler

**Client:**
- Create: `lib/chess/board.tsx` — thin React wrapper around chessground
- Create: `lib/chess/board.test.tsx` — vitest + Testing Library spec
- Modify: `app/globals.css` — append chessground base + brown + cburnett CSS imports
- Create: `public/pieces/cburnett/*.svg` — 12 piece SVGs (sourced in Task 6)
- Modify: `app/page.tsx` — replace placeholder with: board (hardcoded starting position) + "Analyze" button + arrow render on response

**Test infrastructure:**
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts` (jsdom + jest-dom matchers; only loaded for the dom test environment)
- Modify: `package.json` — add `test`, `test:watch`, `test:ui` scripts; add vitest + testing-library devDeps

---

## Prerequisites

Run these before starting; all must pass cleanly. None should require new installation if Plan 0 is shipped:

```bash
cd /Users/mark/Projects/chess-screenshot-analyzer
node --version    # v24.x
pnpm --version    # 10.x
git status        # clean
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build   # all green
```

If anything fails, fix before proceeding.

---

## Task 1: Install runtime + test dependencies

**Files:** `package.json`, `pnpm-lock.yaml` (auto-updated)

- [ ] **Step 1: Install runtime deps**

```bash
pnpm add chessground@latest chessops@latest @se-oss/stockfish@latest zod@latest
```

- [ ] **Step 2: Install vitest + Testing Library devDeps**

```bash
pnpm add -D vitest@latest @vitejs/plugin-react@latest jsdom@latest @testing-library/react@latest @testing-library/jest-dom@latest @testing-library/user-event@latest
```

- [ ] **Step 3: Verify each new dep is importable**

```bash
node -e "import('chessops').then(m => console.log('chessops:', Object.keys(m).slice(0, 5)));"
node -e "import('chessground').then(m => console.log('chessground:', Object.keys(m).slice(0, 5)));"
node -e "import('@se-oss/stockfish').then(m => console.log('@se-oss/stockfish:', Object.keys(m).slice(0, 5)));"
node -e "import('zod').then(m => console.log('zod:', Object.keys(m).slice(0, 5)));"
```

Expected: each prints an array of exported names. If any import throws, fix before proceeding (most likely cause: package name typo or peer-dep mismatch).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore: add chess + engine + test dependencies for Plan 1

- chessground (Lichess board renderer)
- chessops (chess logic + FEN)
- @se-oss/stockfish (Stockfish 17.1 WASM, server-side)
- zod (boundary validation)
- vitest + @testing-library/react + jsdom (test framework)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Pre-commit will run lint-staged + gitleaks; both should pass (no source code yet, just lockfile updates).

---

## Task 2: Set up Vitest with jsdom

**Files:** `vitest.config.ts`, `vitest.setup.ts`, `package.json` (scripts)

- [ ] **Step 1: Create `vitest.config.ts`** at project root, exact contents:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    environmentMatchGlobs: [
      ["**/*.test.tsx", "jsdom"],
      ["**/*.dom.test.ts", "jsdom"],
    ],
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    pool: "forks",
  },
});
```

(Rationale: server-side code runs in Node; DOM tests opt-in via `.test.tsx` or `.dom.test.ts` filename. `pool: "forks"` isolates Stockfish child processes between tests.)

- [ ] **Step 2: Create `vitest.setup.ts`** at project root, exact contents:

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 3: Add test scripts to `package.json`** (inside `scripts`):

```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

- [ ] **Step 4: Write a smoke test** to confirm vitest works. Create `lib/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("vitest sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
pnpm test
```

Expected: 1 test passes. If vitest can't resolve `@vitejs/plugin-react` or anything else, install missing peer deps.

- [ ] **Step 6: Delete the smoke test** (its only purpose was wiring verification)

```bash
rm lib/sanity.test.ts
```

- [ ] **Step 7: Verify pipeline still green**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts vitest.setup.ts package.json
git commit -m "$(cat <<'EOF'
chore: vitest + jsdom test infrastructure

Node env by default; DOM env opt-in via .test.tsx or .dom.test.ts.
Process pool forked to isolate Stockfish WASM child processes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Engine types + Zod schemas (TDD)

**Files:** `lib/engine/types.ts`, `lib/engine/types.test.ts`

- [ ] **Step 1: Write the failing test.** Create `lib/engine/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  FenSchema,
  AnalyzeInputSchema,
  AnalyzeOutputSchema,
} from "./types";

describe("FenSchema", () => {
  it("accepts the starting position FEN", () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    expect(FenSchema.parse(fen)).toBe(fen);
  });

  it("accepts a mid-game FEN", () => {
    const fen = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
    expect(FenSchema.parse(fen)).toBe(fen);
  });

  it("rejects a non-FEN string", () => {
    expect(() => FenSchema.parse("hello world")).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => FenSchema.parse("")).toThrow();
  });

  it("rejects an FEN with wrong side-to-move marker", () => {
    expect(() =>
      FenSchema.parse("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1"),
    ).toThrow();
  });
});

describe("AnalyzeInputSchema", () => {
  it("accepts { fen, depth }", () => {
    const input = {
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      depth: 14,
    };
    expect(AnalyzeInputSchema.parse(input)).toEqual(input);
  });

  it("defaults depth to 14 when omitted", () => {
    const parsed = AnalyzeInputSchema.parse({
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    });
    expect(parsed.depth).toBe(14);
  });

  it("rejects depth > 22", () => {
    expect(() =>
      AnalyzeInputSchema.parse({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        depth: 50,
      }),
    ).toThrow();
  });

  it("rejects depth < 8", () => {
    expect(() =>
      AnalyzeInputSchema.parse({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        depth: 4,
      }),
    ).toThrow();
  });
});

describe("AnalyzeOutputSchema", () => {
  it("accepts a success result with bestMove + eval", () => {
    const result = {
      ok: true as const,
      data: {
        bestMove: "e2e4",
        evalCp: 25,
        depth: 14,
      },
    };
    expect(AnalyzeOutputSchema.parse(result)).toEqual(result);
  });

  it("accepts a failure result with reason", () => {
    const result = {
      ok: false as const,
      reason: "engine_timeout" as const,
    };
    expect(AnalyzeOutputSchema.parse(result)).toEqual(result);
  });

  it("rejects a result missing the discriminator", () => {
    expect(() => AnalyzeOutputSchema.parse({ bestMove: "e2e4" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test — should fail (module not found)**

```bash
pnpm test
```

Expected: failure with "Cannot find module './types'" or similar.

- [ ] **Step 3: Create `lib/engine/types.ts`** with exactly:

```ts
import { z } from "zod";

// FEN regex: piece placement / side / castling / en passant / halfmove / fullmove
// (lenient — we rely on chessops in Stockfish wrapper for strict legality)
const FEN_REGEX =
  /^[1-8pnbrqkPNBRQK/]+ [wb] (-|[KQkqA-Ha-h]+) (-|[a-h][36]) \d+ \d+$/;

export const FenSchema = z
  .string()
  .min(1)
  .regex(FEN_REGEX, { message: "Invalid FEN" });
export type Fen = z.infer<typeof FenSchema>;

export const AnalyzeInputSchema = z.object({
  fen: FenSchema,
  depth: z.number().int().min(8).max(22).default(14),
});
export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;

const AnalyzeSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    bestMove: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Invalid UCI move"),
    evalCp: z.number().int().nullable(),
    mate: z.number().int().nullable().optional(),
    depth: z.number().int(),
  }),
});

const AnalyzeFailureSchema = z.object({
  ok: z.literal(false),
  reason: z.enum(["engine_timeout", "invalid_position", "engine_error"]),
  detail: z.string().optional(),
});

export const AnalyzeOutputSchema = z.discriminatedUnion("ok", [
  AnalyzeSuccessSchema,
  AnalyzeFailureSchema,
]);
export type AnalyzeOutput = z.infer<typeof AnalyzeOutputSchema>;
```

- [ ] **Step 4: Run the test — should pass**

```bash
pnpm test lib/engine/types.test.ts
```

Expected: all green.

- [ ] **Step 5: Verify pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/engine/types.ts lib/engine/types.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): Zod schemas + types for analyze API

FenSchema is regex-based (lenient); chessops validates legality
inside the engine wrapper. AnalyzeOutputSchema is a discriminated
union per spec Appendix C (Discriminated { ok, ... } pattern).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Stockfish engine singleton + `analyzePosition` function (TDD)

**Files:** `lib/engine/stockfish.ts`, `lib/engine/stockfish.test.ts`

- [ ] **Step 1: Write the failing test.** Create `lib/engine/stockfish.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { analyzePosition } from "./stockfish";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("analyzePosition", () => {
  it("returns a valid UCI bestMove from the starting position", async () => {
    const result = await analyzePosition({ fen: STARTING_FEN, depth: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
      expect(result.data.depth).toBeGreaterThanOrEqual(10);
    }
  }, 30_000);

  it("returns ok:false with reason for an obviously invalid FEN", async () => {
    const result = await analyzePosition({
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      depth: 4 as unknown as 10,
      // ^ deliberately invalid via cast — exercises the runtime guard
    });
    // The function should defensively check depth bounds before calling the engine
    // and return ok:false. (Exact behavior may vary; assert the contract.)
    expect(result.ok).toBe(false);
  });
});
```

Note on depth 10: lower than the eventual production default (14) to keep tests fast. Production code uses 14.

- [ ] **Step 2: Run the test — should fail**

```bash
pnpm test lib/engine/stockfish.test.ts
```

Expected: "Cannot find module './stockfish'".

- [ ] **Step 3: Create `lib/engine/stockfish.ts`** with exactly:

```ts
import { Stockfish } from "@se-oss/stockfish";
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
  if (!enginePromise) {
    enginePromise = (async () => {
      const e = new Stockfish();
      await e.waitReady();
      await e.setOptions({ Threads: 1, Hash: 64, UCI_ShowWDL: true });
      return e;
    })();
  }
  return enginePromise;
}

const TIMEOUT_MS = 10_000;

export async function analyzePosition(
  rawInput: unknown,
): Promise<AnalyzeOutput> {
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
    let bestMove = "";
    let lastDepth = 0;
    let lastCp: number | null = null;

    const infoListener = (info: unknown): void => {
      const i = info as {
        depth?: number;
        score?: { type?: string; value?: number };
      };
      if (typeof i.depth === "number") lastDepth = i.depth;
      if (i.score?.type === "cp" && typeof i.score.value === "number") {
        lastCp = i.score.value;
      }
    };
    engine.on("info", infoListener);

    try {
      const result = await Promise.race([
        engine.analyze(fen, depth, 1),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("engine_timeout")), TIMEOUT_MS),
        ),
      ]);
      bestMove = (result as { bestmove?: string }).bestmove ?? "";
    } finally {
      engine.off("info", infoListener);
    }

    return { bestMove, depth: lastDepth, evalCp: lastCp };
  });

  inFlight = run.catch(() => {});

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
```

Note: the `@se-oss/stockfish` exact API may differ slightly from what's shown here (the `info` event payload shape, `analyze()` return shape). If `pnpm test` reveals API mismatches:
- Inspect the package's `.d.ts` files: `cat node_modules/@se-oss/stockfish/dist/index.d.ts`
- Adjust the wrapper to match. Do NOT add `// @ts-ignore`. Do NOT loosen Zod schemas.
- If the API has changed enough that this code is fundamentally wrong, STOP and report BLOCKED with the actual types.

- [ ] **Step 4: Run the test — should pass**

```bash
pnpm test lib/engine/stockfish.test.ts
```

Expected: both tests pass (first takes a few seconds for WASM init + analysis; second is instant since it short-circuits in schema validation).

- [ ] **Step 5: Verify pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/engine/stockfish.ts lib/engine/stockfish.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): warm-singleton Stockfish wrapper with analyzePosition

Module-scope engine reused across requests in the same Fluid Compute
instance. Requests serialized via inFlight Promise chain.
Hash 64MB, Threads 1, UCI_ShowWDL on. 10s timeout. Returns the
discriminated AnalyzeOutput shape from types.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `/api/analyze` route handler (TDD)

**Files:** `app/api/analyze/route.ts`, `app/api/analyze/route.test.ts`

- [ ] **Step 1: Write the failing test.** Create `app/api/analyze/route.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { POST } from "./route";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/analyze", () => {
  it("returns a valid analyze result for the starting position", async () => {
    const res = await POST(makeRequest({ fen: STARTING_FEN, depth: 10 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data?: { bestMove?: string } };
    expect(json.ok).toBe(true);
    expect(json.data?.bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
  }, 30_000);

  it("returns 400 with ok:false for an invalid FEN", async () => {
    const res = await POST(makeRequest({ fen: "not a fen", depth: 10 }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean; reason?: string };
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("invalid_position");
  });

  it("returns 400 for a non-JSON body", async () => {
    const bad = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test — should fail (module not found)**

```bash
pnpm test app/api/analyze/route.test.ts
```

- [ ] **Step 3: Create `app/api/analyze/route.ts`** with exactly:

```ts
import { NextResponse } from "next/server";
import { analyzePosition } from "@/lib/engine/stockfish";
import { AnalyzeInputSchema, type AnalyzeOutput } from "@/lib/engine/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const out: AnalyzeOutput = {
      ok: false,
      reason: "invalid_position",
      detail: "Body is not valid JSON",
    };
    return NextResponse.json(out, { status: 400 });
  }

  const parsed = AnalyzeInputSchema.safeParse(body);
  if (!parsed.success) {
    const out: AnalyzeOutput = {
      ok: false,
      reason: "invalid_position",
      detail: parsed.error.message,
    };
    return NextResponse.json(out, { status: 400 });
  }

  const result = await analyzePosition(parsed.data);
  const status = result.ok ? 200 : result.reason === "invalid_position" ? 400 : 500;
  return NextResponse.json(result, { status });
}
```

- [ ] **Step 4: Run the test — should pass**

```bash
pnpm test app/api/analyze/route.test.ts
```

Expected: all three tests pass. First one warms the engine (slow); others are fast.

- [ ] **Step 5: Verify pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/api/analyze/route.ts app/api/analyze/route.test.ts
git commit -m "$(cat <<'EOF'
feat(api): POST /api/analyze — Zod-validated route to analyzePosition

Node runtime (Fluid Compute), 30s maxDuration. Distinguishes
JSON parse failures (400), validation failures (400), engine
errors (500). Returns the discriminated AnalyzeOutput shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Bundle cburnett piece SVG assets

**Files:** `public/pieces/cburnett/*.svg` (12 files)

The cburnett piece set is the Lichess default — sharp at small sizes, public-domain-friendly, broadly tested on mobile. We need 12 SVG files (one per role × color):

```
public/pieces/cburnett/
  wK.svg  wQ.svg  wR.svg  wB.svg  wN.svg  wP.svg
  bK.svg  bQ.svg  bR.svg  bB.svg  bN.svg  bP.svg
```

(File naming: lowercase color (`w`/`b`) + uppercase role (`K`/`Q`/`R`/`B`/`N`/`P`), to match chessground's CSS class convention.)

- [ ] **Step 1: Identify the source.** The cburnett SVGs live in the `lichess-org/lila` repo at `public/piece/cburnett/`. They're public-domain (Colin M.L. Burnett, 2006). Download them with curl from the raw GitHub URLs:

```bash
mkdir -p public/pieces/cburnett
cd public/pieces/cburnett
BASE="https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett"
for piece in wK wQ wR wB wN wP bK bQ bR bB bN bP; do
  curl -fsSL "$BASE/${piece}.svg" -o "${piece}.svg"
done
ls -la
cd ../../..
```

Expected: 12 SVG files in `public/pieces/cburnett/`, each a few KB. If any curl fails (404), check Lichess's repo path — the directory may have moved.

- [ ] **Step 2: Verify each is a valid SVG**

```bash
for f in public/pieces/cburnett/*.svg; do
  head -1 "$f" | grep -q '<?xml\|<svg' || echo "INVALID: $f"
done
echo "All checked."
```

Expected: no `INVALID` lines.

- [ ] **Step 3: Verify pipeline (gitleaks especially — SVG content shouldn't trip it)**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: clean. (Prettier ignores `public/` per `.prettierignore`.)

- [ ] **Step 4: Commit**

```bash
git add public/pieces/cburnett/
git commit -m "$(cat <<'EOF'
chore(assets): bundle cburnett piece set (12 SVGs)

Public-domain piece set by Colin M.L. Burnett (2006), default for
Lichess. Sharp at small sizes, mobile-friendly.

Source: lichess-org/lila public/piece/cburnett

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Pre-commit lint-staged should be a no-op on SVGs (no matching glob). Gitleaks scans these — they're plain SVG paths and should pass.

---

## Task 7: Chessground CSS — imports in the Board component + piece path overrides in globals.css

**Files:** `app/globals.css` (append rules at end), `lib/chess/board-styles.ts` (new — re-exports for clarity)

CSS `@import` directives must come BEFORE other rules in a stylesheet. Plan 0's shadcn init already wrote CSS variables and other rules into `app/globals.css`, so appending `@import` lines at the bottom is invalid CSS. Strategy: import the chessground base + brown CSS files directly from the Board component (Next.js + Turbopack support ES-module CSS imports anywhere), and put only regular CSS rules (the piece-path overrides) into `globals.css`.

- [ ] **Step 1: Inspect chessground's bundled assets**

```bash
ls node_modules/chessground/assets/ 2>&1
find node_modules/chessground -name "*.css" 2>&1
```

Expected files (paths may vary in newer chessground versions):
- `chessground.base.css` — layout + structure
- `chessground.brown.css` — board theme

If the file names or directory differs, adjust the imports in Step 2 to match. If chessground v10+ has moved CSS to a different location, find it with the `find` command and use those exact paths.

- [ ] **Step 2: Append the piece-path overrides to `app/globals.css`** (regular CSS rules — these are safe to put at the bottom of the file, no @import involved):

```css
/* cburnett piece set — bundled in public/pieces/cburnett/.
   Overrides chessground's stock CSS path so the assets load from /pieces/. */
.cg-wrap piece.pawn.white   { background-image: url("/pieces/cburnett/wP.svg"); }
.cg-wrap piece.knight.white { background-image: url("/pieces/cburnett/wN.svg"); }
.cg-wrap piece.bishop.white { background-image: url("/pieces/cburnett/wB.svg"); }
.cg-wrap piece.rook.white   { background-image: url("/pieces/cburnett/wR.svg"); }
.cg-wrap piece.queen.white  { background-image: url("/pieces/cburnett/wQ.svg"); }
.cg-wrap piece.king.white   { background-image: url("/pieces/cburnett/wK.svg"); }
.cg-wrap piece.pawn.black   { background-image: url("/pieces/cburnett/bP.svg"); }
.cg-wrap piece.knight.black { background-image: url("/pieces/cburnett/bN.svg"); }
.cg-wrap piece.bishop.black { background-image: url("/pieces/cburnett/bB.svg"); }
.cg-wrap piece.rook.black   { background-image: url("/pieces/cburnett/bR.svg"); }
.cg-wrap piece.queen.black  { background-image: url("/pieces/cburnett/bQ.svg"); }
.cg-wrap piece.king.black   { background-image: url("/pieces/cburnett/bK.svg"); }
```

(The actual chessground base + brown CSS imports happen in Task 8's `board.tsx` via ES-module import.)

- [ ] **Step 3: Verify build still succeeds**

```bash
pnpm build 2>&1 | tail -10
```

Expected: build succeeds. The piece-set rules alone don't break anything; the missing chessground.base.css import will be added in Task 8, where the Board component imports it via ES module syntax.

- [ ] **Step 4: Revert any tsconfig.json mutation Next did** during `pnpm build`:

```bash
git diff tsconfig.json
# If non-empty:
git checkout -- tsconfig.json
```

- [ ] **Step 5: Verify pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css
git commit -m "$(cat <<'EOF'
feat(chess): cburnett piece-path CSS overrides

Pieces load from /pieces/cburnett/ (bundled in Task 6). The
chessground base + brown CSS imports happen in board.tsx (Task 8)
to avoid the @import-must-be-first CSS rule.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Board React component (TDD)

**Files:** `lib/chess/board.tsx`, `lib/chess/board.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `lib/chess/board.test.tsx`:

> **NOTE (Task 2 fallback):** Vitest 4 removed `environmentMatchGlobs` from the TypeScript type for `InlineConfig` (typecheck error TS2769). Task 2 fell back to the pragma approach, so this file MUST start with `// @vitest-environment jsdom` as its very first line — otherwise the test runs in the default `node` env and `render()` will throw.

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Board } from "./board";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("Board", () => {
  it("renders without crashing for the starting position", () => {
    const { container } = render(<Board fen={STARTING_FEN} />);
    expect(container.querySelector(".cg-wrap")).not.toBeNull();
  });

  it("accepts arrows prop without crashing", () => {
    const { container } = render(
      <Board
        fen={STARTING_FEN}
        arrows={[{ orig: "e2", dest: "e4", brush: "green" }]}
      />,
    );
    expect(container.querySelector(".cg-wrap")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — should fail**

```bash
pnpm test lib/chess/board.test.tsx
```

- [ ] **Step 3: Create `lib/chess/board.tsx`** with exactly:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { Chessground as makeChessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { DrawShape } from "chessground/draw";

// Chessground's base layout/structure CSS and board theme.
// (Piece sprites come from app/globals.css overrides — see Task 7.)
// If these import paths fail (chessground v10+ may have relocated CSS),
// run `find node_modules/chessground -name "*.css"` and adjust.
import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";

export type ArrowBrush = "green" | "red" | "blue" | "yellow";

export interface BoardArrow {
  orig: string; // square name like "e2"
  dest: string; // square name like "e4"
  brush?: ArrowBrush;
}

export interface BoardProps {
  fen: string;
  arrows?: BoardArrow[];
  orientation?: "white" | "black";
  viewOnly?: boolean;
  className?: string;
}

const DEFAULT_BRUSHES = {
  green: { key: "green", color: "#15B371", opacity: 0.9, lineWidth: 12 },
  red: { key: "red", color: "#EB5757", opacity: 0.9, lineWidth: 12 },
  blue: { key: "blue", color: "#2D9CDB", opacity: 0.9, lineWidth: 12 },
  yellow: { key: "yellow", color: "#F2C94C", opacity: 0.9, lineWidth: 12 },
} as const;

export function Board(props: BoardProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);

  // Mount once
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const config: Config = {
      fen: props.fen,
      viewOnly: props.viewOnly ?? true,
      orientation: props.orientation ?? "white",
      coordinates: true,
      drawable: {
        enabled: true,
        defaultSnapToValidMove: true,
        brushes: DEFAULT_BRUSHES,
      },
    };
    apiRef.current = makeChessground(host, config);
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // Intentionally mount once — subsequent prop changes go through the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile on prop change
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.set({
      fen: props.fen,
      viewOnly: props.viewOnly ?? true,
      orientation: props.orientation ?? "white",
    });
    const shapes: DrawShape[] = (props.arrows ?? []).map((a) => ({
      orig: a.orig as DrawShape["orig"],
      dest: a.dest as DrawShape["dest"],
      brush: a.brush ?? "green",
    }));
    api.setAutoShapes(shapes);
  }, [props.fen, props.arrows, props.orientation, props.viewOnly]);

  return (
    <div
      className={`aspect-square w-full max-w-[min(85vw,420px)] ${props.className ?? ""}`}
    >
      <div ref={hostRef} className="cg-wrap h-full w-full touch-none" />
    </div>
  );
}
```

- [ ] **Step 4: Run the test — should pass**

```bash
pnpm test lib/chess/board.test.tsx
```

Expected: both tests pass.

- [ ] **Step 5: Verify pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

Expected: clean.

Watch for these likely issues:
- chessground's TypeScript types may have evolved; if `DrawShape["orig"]` is no longer the right type, adjust the cast.
- ESLint's `react-hooks/exhaustive-deps` may complain about the mount-only effect — the inline `eslint-disable-next-line` covers it with the explanatory comment.

- [ ] **Step 6: Commit**

```bash
git add lib/chess/board.tsx lib/chess/board.test.tsx
git commit -m "$(cat <<'EOF'
feat(chess): Board component (chessground React wrapper)

Thin wrapper: mount once via Snabbdom; reconcile fen/arrows on prop
change via api.set + api.setAutoShapes. Brushes for green/red/blue/yellow
arrows. Responsive sizing (max 85vw, max 420px square).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire the Board into `app/page.tsx`

**Files:** `app/page.tsx`

Replace the Plan 0 placeholder with: starting-position board + "Analyze" button + arrow render on response.

- [ ] **Step 1: Replace `app/page.tsx`** with exactly:

```tsx
"use client";

import { useState } from "react";
import { Board, type BoardArrow } from "@/lib/chess/board";
import { Button } from "@/components/ui/button";
import type { AnalyzeOutput } from "@/lib/engine/types";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

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
      {status === "error" ? (
        <p className="text-sm text-red-500">Error: {errorMsg}</p>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 2: Run pnpm dev** in the background and verify locally:

```bash
pnpm dev &
PNPM_DEV_PID=$!
sleep 6   # give Next.js a moment to start
curl -s http://localhost:3000/ | grep -E '<title>|cg-wrap' | head -2
# Now exercise the API directly:
curl -s -X POST http://localhost:3000/api/analyze \
  -H 'content-type: application/json' \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","depth":10}' \
  | head -5
kill $PNPM_DEV_PID 2>/dev/null
wait 2>/dev/null
```

Expected: HTML contains the title; the API responds with `{"ok":true,"data":{"bestMove":"...","evalCp":...,"depth":...}}`.

- [ ] **Step 3: Verify pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

Expected: all clean. Revert any tsconfig.json mutation from the build (Plan 0 known issue):

```bash
git diff tsconfig.json
# If non-empty: git checkout -- tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
feat: hardcoded starting position + Analyze button wired to /api/analyze

Plan 1 vertical slice end-to-end: client POSTs FEN, server runs
Stockfish at depth 14, response paints an arrow on the board for
the best move.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Deploy + phone verification + close Plan 1

**Files:** none (push + verify)

- [ ] **Step 1: Push to origin**

```bash
git push origin main
```

Expected: push succeeds. CI workflow runs (typecheck + lint + format + build) and security workflow (gitleaks) — both must pass.

- [ ] **Step 2: Watch CI**

```bash
gh run watch --exit-status 2>&1 | tail -10
```

Expected: workflows complete successfully.

- [ ] **Step 3: Wait for and verify the Vercel deploy**

```bash
sleep 45
/Users/mark/Library/pnpm/vercel ls --prod 2>&1 | head -5
```

Expected: a new production deployment in "● Ready" status with a fresh hash in the URL.

- [ ] **Step 4: Smoke-test the deployed URL via curl**

```bash
PROD_URL=$(/Users/mark/Library/pnpm/vercel ls --prod 2>/dev/null | grep -oE 'https://chess-screenshot-analyzer-[a-z0-9]+-mark-6951s-projects\.vercel\.app' | head -1)
echo "$PROD_URL"
curl -sI "$PROD_URL/" | head -1
curl -s -X POST "$PROD_URL/api/analyze" \
  -H 'content-type: application/json' \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","depth":12}' \
  | head -5
```

Expected: HTTP 200 on `/`; `{"ok":true,...}` JSON on `/api/analyze` with a UCI move and an eval. The first request after deploy may be slower (~1-2s) as the Vercel instance warms Stockfish.

- [ ] **Step 5: Manual phone verification.** Mark opens the PWA on his phone (it's already installed from Plan 0; the new version should be served on next launch). Expected behavior:
  - Board renders showing the starting position
  - "Analyze" button visible and tappable
  - Tap: button shows "Analyzing..." briefly, then board paints a green arrow for the best move (e.g., `e2→e4` or `g1→f3` depending on Stockfish's choice at depth 14)
  - Tap again: works idempotently — same arrow (Stockfish is deterministic at given depth)

- [ ] **Step 6: Update CLAUDE.md execution-state breadcrumb**

Edit `CLAUDE.md` and change the "Current execution state" block from:

```
### Current execution state

- **Plan 0 (rails) — SHIPPED.** ...
- **Next plan:** Slice 1 — Static board + engine call. Plan document not yet written; the writing-plans skill produces it from spec Section 10.
- **Latest commit:** see `git log -1`.
```

to:

```
### Current execution state

- **Plan 0 (rails) — SHIPPED.** Production live, CI gates merges, three-layer secret protection active.
- **Plan 1 (static board + engine call) — SHIPPED.** Production includes a starting-position board + an Analyze button that POSTs to /api/analyze (Stockfish 17.1 WASM, depth 14) and paints the best move as a green arrow.
- **Next plan:** Slice 2 — Vision parse (paste image → FEN). Plan document not yet written.
- **Latest commit:** see `git log -1`.
```

(Leave the "Known follow-ups" section unchanged unless any of the listed items have been addressed.)

- [ ] **Step 7: Commit and push the CLAUDE.md update**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: mark Plan 1 complete; resume marker → Slice 2

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Done

End state of Plan 1:

- Hardcoded chess position renders on the PWA
- An Analyze button POSTs to `/api/analyze`
- Stockfish 17.1 WASM (server-side, warm singleton, depth 14, Hash 64MB, single thread) returns the best move
- Board paints the move as a green arrow
- Every step is type-checked, lint-clean, format-clean, gitleaks-clean, and tested with vitest
- CI and Vercel auto-deploy continue to function

Plan 2 (Vision parse: paste image → FEN) is the next slice. The agent loop, the chat UI, and persistence all come in slices 3+.
