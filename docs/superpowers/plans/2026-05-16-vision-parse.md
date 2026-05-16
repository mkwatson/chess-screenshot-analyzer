# Plan 2 — Vision Parse (paste image → FEN)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the hardcoded FEN. The user pastes a chess-board screenshot on the phone, the page sends the image to a server endpoint that calls Gemini 3 Flash vision (via the Vercel AI Gateway), gets back a structured FEN, validates it for legality with chessops, and renders the parsed position on the existing board. The existing Analyze button (Plan 1) then works on whatever was parsed.

**Architecture:** Single new server endpoint `/api/parse-screenshot` that takes an image (base64-encoded JSON or multipart) and returns a discriminated `{ ok, data: { fen, sideToMove, confidence } | failure }`. The endpoint uses `@ai-sdk/google` via the Vercel `ai-sdk` gateway provider with `gemini-3-flash`, `media_resolution: 'HIGH'`, `thinkingLevel: 'minimal'`, and `responseSchema` for strict JSON output. On the client, the page adds a paste-image button (`navigator.clipboard.read()` primary, file picker fallback) that POSTs to the new endpoint. No confirmation step in v0 (per Mark's preference — trust the LLM; Plan 6's `editPosition` adds correction UX later).

**Tech stack:** New: `ai`, `@ai-sdk/google`, `@ai-sdk/gateway`. Existing: chessops (legality check), Zod (boundary validation), Next.js 16, Vitest. Gemini API key is provisioned on **Vidably** GCP per spec Section 3.1; AI Gateway routes through Mark's personal Vercel project.

---

## Reference docs

- `AGENTS.md` — read first
- Spec: `docs/superpowers/specs/2026-05-16-chess-screenshot-analyzer-design.md`
  - Section 3.1 — Vendor scoping (Google AI on Vidably, all other vendors personal)
  - Section 4.3 — Context strategy (Gemini implicit caching; we set up stable prefix here)
  - Section 4.4–4.5 — System prompt structure + tool design conventions (Plan 2's parse is a precursor to the agent's `parseScreenshot` tool)
  - Section 5.2 — Composer + paste UX (iOS Safari clipboard quirks)
  - Section 7.3 — Vision parse implementation sketch

---

## File structure (created or modified)

**Server:**
- Create: `lib/vision/types.ts` — Zod schemas: `ParseInputSchema`, `ParseOutputSchema`
- Create: `lib/vision/parse-screenshot.ts` — Gemini vision call + chessops legality validation + retry-once
- Create: `lib/vision/parse-screenshot.test.ts` — vitest spec (mocks Gemini)
- Create: `app/api/parse-screenshot/route.ts` — POST handler
- Create: `app/api/parse-screenshot/route.test.ts` — vitest spec

**Client:**
- Modify: `app/page.tsx` — replace hardcoded starting FEN with "paste-to-start" empty state; add paste-image button + file picker fallback; on parse success update the FEN; existing Analyze button reused

**Configuration:**
- Modify: `next.config.ts` — extend `outputFileTracingIncludes` to cover any AI SDK files Turbopack drops (defensive; we'll see if needed)
- Modify: `.env.example` — uncomment `GOOGLE_GENERATIVE_AI_API_KEY` and `AI_GATEWAY_API_KEY` placeholders
- Vercel dashboard: add the two API keys as encrypted env vars in Production + Preview + Development

---

## Prerequisites

Run these before starting:

```bash
cd /Users/mark/Projects/chess-screenshot-analyzer
git status                                  # clean
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test   # all green
gh run list --workflow=ci.yml --limit 1     # latest CI green
```

**Mark provides** before Task 2 begins:
- A Google AI Studio API key (created in a Vidably GCP project, distinct from any production Vidably project — per spec Section 3.1). Free credits + pay-as-you-go thereafter.
- A Vercel AI Gateway API key from the Vercel dashboard (Settings → AI Gateway → Create Key). Free; gives observability + ZDR even single-provider.

Both keys MUST live in Vercel dashboard env vars (`Production`, `Preview`, `Development`) AND in local `.env.local` (gitignored). They MUST NOT appear in source, commits, .env.example, comments, logs, or anywhere on the public GitHub surface — per the "no secrets, ever" rule in `AGENTS.md`.

---

## Task 1: Install AI SDK + Google provider + Gateway

**Files:** `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install runtime deps**

```bash
pnpm add ai@latest @ai-sdk/google@latest @ai-sdk/gateway@latest
```

- [ ] **Step 2: Verify each is importable**

```bash
node -e "import('ai').then(m => console.log('ai:', Object.keys(m).slice(0, 6)));"
node -e "import('@ai-sdk/google').then(m => console.log('@ai-sdk/google:', Object.keys(m).slice(0, 6)));"
node -e "import('@ai-sdk/gateway').then(m => console.log('@ai-sdk/gateway:', Object.keys(m).slice(0, 6)));"
```

Expected: each prints exported names. If `ai` ≥ v6 (the version we want per spec), `streamText`/`generateObject`/`tool` are exposed.

- [ ] **Step 3: Verify pipeline still passes** (no source changed yet)

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore: add AI SDK + Google provider + AI Gateway for Plan 2

- ai@latest (Vercel AI SDK v6+)
- @ai-sdk/google (Gemini provider)
- @ai-sdk/gateway (routes through Vercel AI Gateway for observability + ZDR)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Provision API keys (Mark) and update `.env.example`

This task interleaves Mark's actions (creating keys, adding them to Vercel dashboard) with a commit-able `.env.example` update.

**Files:** `.env.example`

**Mark — before this task can be completed:**

1. **Google AI Studio key:**
   - Sign into https://aistudio.google.com/ with the Vidably Google account (NOT personal).
   - Create a new API key, scoped to a new Vidably GCP project named e.g. `chess-screenshot-analyzer` (or attach to an existing personal-side-project GCP project under Vidably).
   - Copy the key.

2. **Vercel AI Gateway key:**
   - Open https://vercel.com/mark-6951s-projects/chess-screenshot-analyzer/settings/ai-gateway (or top-level Vercel dashboard → AI Gateway → create key for this project).
   - Create a new key with a memorable name (e.g. `chess-screenshot-analyzer-prod`).
   - Copy the key.

3. **Add both to Vercel project env vars:**
   - Vercel dashboard → this project → Settings → Environment Variables.
   - Add `GOOGLE_GENERATIVE_AI_API_KEY` with the AI Studio key. Scopes: Production, Preview, Development. **Encrypted (default).**
   - Add `AI_GATEWAY_API_KEY` with the Gateway key. Same scopes. Same encryption.

4. **Add both to local `.env.local`:**

```bash
cd /Users/mark/Projects/chess-screenshot-analyzer
cat > .env.local <<'EOF'
GOOGLE_GENERATIVE_AI_API_KEY=<paste-google-key>
AI_GATEWAY_API_KEY=<paste-gateway-key>
EOF
```

(`.env.local` is gitignored. Verify with `git status` — it should NOT appear.)

5. **Verify gitleaks doesn't trip on `.env.local`:**

```bash
gitleaks git --redact -v --no-banner --config .gitleaks.toml . | tail -5
```

Expected: "no leaks found." If gitleaks somehow scans uncommitted/gitignored files and flags, abort — there's a config issue.

**Subagent / engineer step (after Mark confirms):**

- [ ] **Step 1: Update `.env.example`** so contributors know what's needed. Replace the file contents with exactly:

```
# Provisioned in later plans; copy to .env.local and fill with dev values.

# Plan 2 — Gemini vision via Vercel AI Gateway
GOOGLE_GENERATIVE_AI_API_KEY=
AI_GATEWAY_API_KEY=

# Future plans will introduce additional variables:
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=
# POSTHOG_KEY=
# NEXT_PUBLIC_POSTHOG_KEY=
# NEXT_PUBLIC_POSTHOG_HOST=
```

- [ ] **Step 2: Verify pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "$(cat <<'EOF'
chore: surface Gemini + AI Gateway env vars in .env.example

Actual values live in .env.local (gitignored) and the Vercel dashboard.
Per AGENTS.md's hard rule, .env.example MUST never contain real values.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Pre-commit gitleaks MUST pass — the file has only variable names, no values.

---

## Task 3: Vision Zod schemas (TDD)

**Files:** `lib/vision/types.ts`, `lib/vision/types.test.ts`

- [ ] **Step 1: Write the failing test.** Create `lib/vision/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ParseInputSchema, ParseOutputSchema } from "./types";

describe("ParseInputSchema", () => {
  it("accepts a valid base64-encoded image input", () => {
    const input = {
      imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      mimeType: "image/png" as const,
    };
    expect(ParseInputSchema.parse(input)).toEqual(input);
  });

  it("accepts jpeg", () => {
    const input = {
      imageBase64: "data".repeat(10),
      mimeType: "image/jpeg" as const,
    };
    expect(ParseInputSchema.parse(input)).toEqual(input);
  });

  it("rejects unsupported mime types", () => {
    expect(() =>
      ParseInputSchema.parse({
        imageBase64: "data",
        mimeType: "image/gif",
      }),
    ).toThrow();
  });

  it("rejects empty image data", () => {
    expect(() =>
      ParseInputSchema.parse({ imageBase64: "", mimeType: "image/png" }),
    ).toThrow();
  });

  it("rejects images larger than the cap", () => {
    // The schema imposes a max-size cap (in base64-encoded chars) to prevent
    // accidental gigabyte payloads. Default cap is generous (~8MB encoded).
    const tooBig = "A".repeat(20 * 1024 * 1024);
    expect(() =>
      ParseInputSchema.parse({ imageBase64: tooBig, mimeType: "image/png" }),
    ).toThrow();
  });
});

describe("ParseOutputSchema", () => {
  it("accepts a success result", () => {
    const result = {
      ok: true as const,
      data: {
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        sideToMove: "w" as const,
        confidence: 0.95,
      },
    };
    expect(ParseOutputSchema.parse(result)).toEqual(result);
  });

  it("accepts a failure result", () => {
    const result = {
      ok: false as const,
      reason: "illegal_position" as const,
      detail: "Two white kings",
    };
    expect(ParseOutputSchema.parse(result)).toEqual(result);
  });

  it("rejects success result with confidence > 1", () => {
    expect(() =>
      ParseOutputSchema.parse({
        ok: true,
        data: {
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          sideToMove: "w",
          confidence: 1.5,
        },
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run — should fail** with "Cannot find module './types'"

```bash
pnpm test lib/vision/types.test.ts
```

- [ ] **Step 3: Create `lib/vision/types.ts`** with exactly:

```ts
import { z } from "zod";
import { FenSchema } from "@/lib/engine/types";

// Base64-encoded image; cap at ~8 MB encoded (roughly 6 MB raw) to bound
// request size. Real chess screenshots from phones are typically under 500 KB.
const MAX_BASE64_CHARS = 8 * 1024 * 1024;

export const ParseInputSchema = z.object({
  imageBase64: z.string().min(1).max(MAX_BASE64_CHARS),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});
export type ParseInput = z.infer<typeof ParseInputSchema>;

const ParseSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    fen: FenSchema,
    sideToMove: z.enum(["w", "b"]),
    confidence: z.number().min(0).max(1),
  }),
});

const ParseFailureSchema = z.object({
  ok: z.literal(false),
  reason: z.enum([
    "no_chess_board_detected",
    "illegal_position",
    "low_confidence",
    "vision_error",
    "invalid_input",
  ]),
  detail: z.string().optional(),
});

export const ParseOutputSchema = z.discriminatedUnion("ok", [
  ParseSuccessSchema,
  ParseFailureSchema,
]);
export type ParseOutput = z.infer<typeof ParseOutputSchema>;
```

- [ ] **Step 4: Run — should pass**

```bash
pnpm test lib/vision/types.test.ts
```

- [ ] **Step 5: Verify pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

- [ ] **Step 6: Commit**

```bash
git add lib/vision/types.ts lib/vision/types.test.ts
git commit -m "$(cat <<'EOF'
feat(vision): Zod schemas for parse-screenshot input/output

ParseInputSchema bounds image size; ParseOutputSchema is a
discriminated union per Appendix C. Reuses FenSchema from lib/engine/types.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: parseScreenshot function — Gemini call + chessops validation + retry (TDD)

**Files:** `lib/vision/parse-screenshot.ts`, `lib/vision/parse-screenshot.test.ts`

The function:
1. Validates input with `ParseInputSchema.safeParse`
2. Calls Gemini 3 Flash via `@ai-sdk/google` + AI Gateway with `media_resolution: 'HIGH'`, `thinkingLevel: 'minimal'`, and a strict `responseSchema` returning `{ fen, sideToMove, confidence }`
3. Validates the returned FEN for legality using chessops (`Chess.fromSetup(parseFen(fen).unwrap())`)
4. On illegal-position: retries ONCE with feedback `"The previous parse produced an illegal position: <error>. Try again carefully."`
5. Returns the discriminated `ParseOutput` shape

- [ ] **Step 1: Write the failing test.** Create `lib/vision/parse-screenshot.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @ai-sdk/google + ai's generateObject before importing the SUT.
const generateObjectMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateObject: (...args: unknown[]) => generateObjectMock(...args),
  };
});

import { parseScreenshot } from "./parse-screenshot";

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const ILLEGAL_FEN =
  // Two white kings — clearly illegal
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBKK w KQkq - 0 1";

const VALID_INPUT = {
  imageBase64: "iVBORw0KGgo=",
  mimeType: "image/png" as const,
};

beforeEach(() => {
  generateObjectMock.mockReset();
});

describe("parseScreenshot", () => {
  it("returns ok:true on a legal-FEN parse", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { fen: STARTING_FEN, sideToMove: "w", confidence: 0.95 },
    });
    const result = await parseScreenshot(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.fen).toBe(STARTING_FEN);
      expect(result.data.confidence).toBe(0.95);
    }
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on illegal position then succeeds", async () => {
    generateObjectMock
      .mockResolvedValueOnce({
        object: { fen: ILLEGAL_FEN, sideToMove: "w", confidence: 0.9 },
      })
      .mockResolvedValueOnce({
        object: { fen: STARTING_FEN, sideToMove: "w", confidence: 0.92 },
      });
    const result = await parseScreenshot(VALID_INPUT);
    expect(result.ok).toBe(true);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("returns ok:false illegal_position when retry also fails", async () => {
    generateObjectMock
      .mockResolvedValueOnce({
        object: { fen: ILLEGAL_FEN, sideToMove: "w", confidence: 0.9 },
      })
      .mockResolvedValueOnce({
        object: { fen: ILLEGAL_FEN, sideToMove: "w", confidence: 0.5 },
      });
    const result = await parseScreenshot(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("illegal_position");
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("returns ok:false invalid_input on a bad input shape", async () => {
    const result = await parseScreenshot({
      imageBase64: "",
      mimeType: "image/png",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_input");
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("returns ok:false vision_error if generateObject throws", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("Gemini outage"));
    const result = await parseScreenshot(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("vision_error");
  });
});
```

- [ ] **Step 2: Run — should fail** with "Cannot find module './parse-screenshot'"

```bash
pnpm test lib/vision/parse-screenshot.test.ts
```

- [ ] **Step 3: Create `lib/vision/parse-screenshot.ts`** with exactly:

```ts
import { generateObject } from "ai";
import { z } from "zod";
import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";
import { ParseInputSchema, type ParseOutput } from "./types";

// Output schema for the Gemini call. Wider than ParseOutputSchema's success
// branch — Gemini sometimes returns trailing whitespace or extra fields that
// don't violate the schema but aren't strictly the FEN regex; we re-validate
// downstream via chessops.
const GeminiOutputSchema = z.object({
  fen: z.string().min(1),
  sideToMove: z.enum(["w", "b"]),
  confidence: z.number().min(0).max(1),
});

const SYSTEM_INSTRUCTION = `You are a chess board image parser. Given an image \
containing a chess position, return the FEN representation in standard format \
(piece placement / side / castling / en passant / halfmove / fullmove). Use \
uppercase letters for white pieces and lowercase for black. If you cannot \
detect a chess board in the image, respond with confidence: 0 and best-guess \
empty board. Confidence is your subjective certainty in the parse (0-1).`;

const MODEL_ID = "google/gemini-3-flash";

function isLegalFen(fen: string): { ok: true } | { ok: false; reason: string } {
  const parsed = parseFen(fen);
  if (parsed.isErr) {
    return { ok: false, reason: parsed.error.message };
  }
  const pos = Chess.fromSetup(parsed.value);
  if (pos.isErr) {
    return { ok: false, reason: pos.error.message };
  }
  return { ok: true };
}

async function callGemini(args: {
  imageBase64: string;
  mimeType: string;
  retryFeedback?: string;
}): Promise<{ fen: string; sideToMove: "w" | "b"; confidence: number }> {
  const prompt = args.retryFeedback
    ? `The previous parse produced an illegal position: ${args.retryFeedback}. Try again carefully, paying close attention to piece positions.`
    : "Read this chess position and return the FEN.";

  const result = await generateObject({
    model: MODEL_ID,
    system: SYSTEM_INSTRUCTION,
    schema: GeminiOutputSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            image: Buffer.from(args.imageBase64, "base64"),
            mediaType: args.mimeType,
          },
          { type: "text", text: prompt },
        ],
      },
    ],
    providerOptions: {
      google: {
        mediaResolution: "HIGH",
        thinkingConfig: { thinkingLevel: "minimal" },
      },
    },
  });

  return result.object;
}

export async function parseScreenshot(rawInput: unknown): Promise<ParseOutput> {
  const parsed = ParseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_input",
      detail: parsed.error.message,
    };
  }

  let attempt: Awaited<ReturnType<typeof callGemini>>;
  try {
    attempt = await callGemini({
      imageBase64: parsed.data.imageBase64,
      mimeType: parsed.data.mimeType,
    });
  } catch (e) {
    return {
      ok: false,
      reason: "vision_error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  let legality = isLegalFen(attempt.fen);
  if (!legality.ok) {
    try {
      const retried = await callGemini({
        imageBase64: parsed.data.imageBase64,
        mimeType: parsed.data.mimeType,
        retryFeedback: legality.reason,
      });
      const retryLegality = isLegalFen(retried.fen);
      if (!retryLegality.ok) {
        return {
          ok: false,
          reason: "illegal_position",
          detail: retryLegality.reason,
        };
      }
      attempt = retried;
      legality = retryLegality;
    } catch (e) {
      return {
        ok: false,
        reason: "vision_error",
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return {
    ok: true,
    data: {
      fen: attempt.fen,
      sideToMove: attempt.sideToMove,
      confidence: attempt.confidence,
    },
  };
}
```

Note: the `model: "google/gemini-3-flash"` string assumes the AI SDK Gateway is configured (Task 1 installed `@ai-sdk/gateway`). The SDK auto-resolves `<provider>/<model>` strings via the Gateway when `AI_GATEWAY_API_KEY` is set. If it doesn't, fall back to the direct provider syntax `model: google("gemini-3-flash")` and import `google` from `@ai-sdk/google` — but try the gateway-prefixed string FIRST.

If the Gemini API has changed (e.g., `mediaResolution` or `thinkingConfig` is in a different `providerOptions` path), check via Context7 (search "ai-sdk google") and adjust.

- [ ] **Step 4: Run — all five tests should pass**

```bash
pnpm test lib/vision/parse-screenshot.test.ts
```

- [ ] **Step 5: Verify pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

- [ ] **Step 6: Commit**

```bash
git add lib/vision/parse-screenshot.ts lib/vision/parse-screenshot.test.ts
git commit -m "$(cat <<'EOF'
feat(vision): parseScreenshot — Gemini 3 Flash vision + chessops legality

Validates input via ParseInputSchema; calls Gemini through the AI
Gateway with media_resolution: HIGH and thinkingLevel: minimal;
validates the returned FEN with chessops for legality; retries ONCE
with error feedback on illegal positions; returns the discriminated
ParseOutput shape per Appendix C.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `/api/parse-screenshot` route handler (TDD)

**Files:** `app/api/parse-screenshot/route.ts`, `app/api/parse-screenshot/route.test.ts`

- [ ] **Step 1: Write the failing test.** Create `app/api/parse-screenshot/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock parseScreenshot — the route is a thin wrapper around it.
const parseScreenshotMock = vi.fn();
vi.mock("@/lib/vision/parse-screenshot", () => ({
  parseScreenshot: (input: unknown) => parseScreenshotMock(input),
}));

import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/parse-screenshot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  parseScreenshotMock.mockReset();
});

describe("POST /api/parse-screenshot", () => {
  it("returns 200 + success body when parseScreenshot succeeds", async () => {
    parseScreenshotMock.mockResolvedValueOnce({
      ok: true,
      data: {
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        sideToMove: "w",
        confidence: 0.9,
      },
    });
    const res = await POST(
      makeRequest({ imageBase64: "iVBORw==", mimeType: "image/png" }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("returns 400 + failure body when parseScreenshot reports invalid_input", async () => {
    parseScreenshotMock.mockResolvedValueOnce({
      ok: false,
      reason: "invalid_input",
      detail: "Required",
    });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 502 when parseScreenshot reports vision_error", async () => {
    parseScreenshotMock.mockResolvedValueOnce({
      ok: false,
      reason: "vision_error",
      detail: "Gemini outage",
    });
    const res = await POST(
      makeRequest({ imageBase64: "iVBORw==", mimeType: "image/png" }),
    );
    expect(res.status).toBe(502);
  });

  it("returns 400 for a non-JSON body", async () => {
    const bad = new Request("http://localhost/api/parse-screenshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
pnpm test app/api/parse-screenshot/route.test.ts
```

- [ ] **Step 3: Create `app/api/parse-screenshot/route.ts`** with exactly:

```ts
import { NextResponse } from "next/server";
import { parseScreenshot } from "@/lib/vision/parse-screenshot";
import type { ParseOutput } from "@/lib/vision/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function statusFor(result: ParseOutput): number {
  if (result.ok) return 200;
  switch (result.reason) {
    case "invalid_input":
      return 400;
    case "no_chess_board_detected":
    case "illegal_position":
    case "low_confidence":
      return 422;
    case "vision_error":
      return 502;
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const out: ParseOutput = {
      ok: false,
      reason: "invalid_input",
      detail: "Body is not valid JSON",
    };
    return NextResponse.json(out, { status: 400 });
  }

  const result = await parseScreenshot(body);
  return NextResponse.json(result, { status: statusFor(result) });
}
```

- [ ] **Step 4: Run — should pass**

```bash
pnpm test app/api/parse-screenshot/route.test.ts
```

- [ ] **Step 5: Verify pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

- [ ] **Step 6: Commit**

```bash
git add app/api/parse-screenshot/route.ts app/api/parse-screenshot/route.test.ts
git commit -m "$(cat <<'EOF'
feat(api): POST /api/parse-screenshot — thin wrapper around parseScreenshot

Node runtime, 30s maxDuration. Distinguishes JSON parse failures (400),
invalid input (400), parsing failures (422), and vision/provider
errors (502). Returns the discriminated ParseOutput shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Paste-image UX + parse flow on the page

**Files:** `app/page.tsx`

Replace Plan 1's "hardcoded starting position" with a "paste-to-start" empty state. Paste button (primary), file picker fallback, parsing status indicator, then board + Analyze button reappears once a FEN is loaded.

- [ ] **Step 1: Replace `app/page.tsx`** with exactly:

```tsx
"use client";

import { useRef, useState } from "react";
import { Board, type BoardArrow } from "@/lib/chess/board";
import { Button } from "@/components/ui/button";
import type { AnalyzeOutput } from "@/lib/engine/types";
import type { ParseOutput } from "@/lib/vision/types";

type Phase = "empty" | "parsing" | "ready" | "analyzing" | "error";

async function fileToBase64(blob: Blob): Promise<{ base64: string; mimeType: "image/png" | "image/jpeg" | "image/webp" }> {
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
```

- [ ] **Step 2: Smoke-test locally** (requires `.env.local` with real Gemini + Gateway keys — Mark set these up in Task 2). With keys absent, the page will load but parsing will fail with a vision_error.

```bash
pnpm dev &
PNPM_DEV_PID=$!
sleep 6
curl -sI http://localhost:3000/ | head -1
# The /api/parse-screenshot endpoint requires a real image — verify it 404s
# only on the route correctness, not by exercising the full pipeline here.
# Smoke test via the existing analyze endpoint to confirm dev server up:
curl -s -X POST http://localhost:3000/api/analyze \
  -H 'content-type: application/json' \
  -d '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","depth":10}' \
  | head -3
kill $PNPM_DEV_PID 2>/dev/null
wait 2>/dev/null
```

Expected: HTTP 200 on `/`; analyze still works (Plan 1 regression check).

- [ ] **Step 3: Verify full pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
git diff tsconfig.json
# If non-empty: git checkout -- tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "$(cat <<'EOF'
feat: paste-image flow on the page

Empty state → paste button (or file picker fallback) → /api/parse-screenshot
→ board renders the parsed FEN → existing Analyze button (Plan 1) operates
on the parsed position.

No confirmation step in v0 per Mark's preference: trust Gemini's parse.
Plan 6's editPosition tool adds correction UX later.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Deploy + production smoke test + close

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Watch CI**

```bash
gh run watch --exit-status 2>&1 | tail -10
```

Both CI and Security workflows must pass.

- [ ] **Step 3: Wait for the Vercel auto-deploy.** Use a poll-until-ready loop, not a bare sleep:

```bash
until /Users/mark/Library/pnpm/vercel ls --prod 2>/dev/null | grep -q "● Ready.*Production"; do sleep 5; done
PROD=$(/Users/mark/Library/pnpm/vercel ls --prod 2>&1 | grep -oE 'https://chess-screenshot-analyzer-[a-z0-9]+-mark-6951s-projects\.vercel\.app' | head -1)
echo "$PROD"
```

- [ ] **Step 4: Production smoke test.** Use a real, small chess-board screenshot. Easiest: a chess.com daily puzzle screenshot OR a Lichess analysis-board screenshot saved as `test-board.png` somewhere accessible. If no real screenshot is handy, skip the production parse test — only Mark's phone test (Step 5) is authoritative.

If a test PNG is available:

```bash
# Convert to base64 and POST:
BASE64=$(base64 -i /path/to/test-board.png | tr -d '\n')
curl -s -X POST "$PROD/api/parse-screenshot" \
  -H 'content-type: application/json' \
  -d "{\"imageBase64\":\"$BASE64\",\"mimeType\":\"image/png\"}" \
  -w '\nHTTP %{http_code}, total=%{time_total}s\n'
```

Expected: `{"ok":true,"data":{"fen":"...","sideToMove":"w" or "b","confidence":0-1}}` with a sensible FEN matching the screenshot. First call after cold start may take ~5-10s.

- [ ] **Step 5: Phone test (Mark).** On the iPhone:
  1. Force-quit the home-screen PWA (swipe-up + swipe-away), or open the production URL in Safari directly.
  2. Take or open a screenshot of a chess position (e.g., screenshot any Chess.com or Lichess game).
  3. Tap **Paste a chess position**. iOS will prompt for clipboard permission the first time — allow.
  4. Wait ~5 seconds for parsing. The board should render with the parsed position.
  5. Tap **Analyze**. The green best-move arrow should appear.

  If the parsed position is visually wrong, that's expected at v0 — we'll add `editPosition` in Plan 6. For Plan 2, the goal is end-to-end-working: paste → parse → render → analyze.

- [ ] **Step 6: Update CLAUDE.md execution state**

Edit `CLAUDE.md` to change the "Current execution state" block:

```
### Current execution state

- **Plan 0 (rails) — SHIPPED.** ...
- **Plan 1 (static board + engine call) — SHIPPED.** ...
- **Plan 2 (vision parse) — SHIPPED.** Production accepts a pasted chess screenshot, parses it via Gemini 3 Flash through the Vercel AI Gateway, validates legality with chessops (retries once on illegal positions), renders the parsed board, and reuses the Plan 1 Analyze button on whatever was parsed.
- **Next plan:** Slice 3 — One-turn coach chat. Plan document not yet written.
- **Latest commit:** see `git log -1`.
```

- [ ] **Step 7: Commit + push the CLAUDE.md update**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: mark Plan 2 complete; resume marker → Slice 3

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Done

End state of Plan 2:

- Paste a chess-board screenshot from your phone (or pick from Photos)
- Server uses Gemini 3 Flash vision (via the Vercel AI Gateway, `media_resolution: HIGH`, `thinkingLevel: minimal`) to extract a FEN
- chessops validates legality; one retry on illegal positions
- Parsed board renders; existing Analyze button works on it
- Every step type-checked, lint-clean, format-clean, gitleaks-clean, tested with vitest
- API keys live in Vercel dashboard env vars + local `.env.local` (gitignored); `.env.example` has variable names but never values

Plan 3 (One-turn coach chat) is next — replace the static page with assistant-ui chat, agent loop, `parseScreenshot` and `analyzePosition` as agent tools. The standalone POST endpoints stay for now but the chat layer becomes the primary UX.
