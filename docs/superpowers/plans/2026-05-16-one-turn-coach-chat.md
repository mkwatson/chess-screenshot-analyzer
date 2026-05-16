# Plan 3 — One-turn Coach Chat

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two single-purpose buttons (`Paste a chess position` + `Analyze`) with a single streaming chat surface. The user pastes / uploads a chess screenshot into an assistant-ui composer (textarea-with-attachment-tray, ChatGPT-style), types an optional question, and sends. One `/api/chat` route runs the agent end-to-end using AI SDK v6 `streamText` + the agent's tool palette; the chat renders parsed boards inline as the agent reasons.

**Architecture:**
- **One streaming endpoint:** `/api/chat`, AI SDK v6 `streamText` with tools.
- **Pre-pass image parse:** when the latest user message has an image attachment, the route calls `parseScreenshot()` (already shipped in Plan 2) BEFORE invoking the agent, then injects the parsed FEN into the conversation as a hidden system note. The agent never has to call parseScreenshot as a tool; it just sees `FEN: …` in context. This is simpler than threading image bytes through the tool layer.
- **Two server tools for the agent (Plan 3 scope):**
  - `analyzePosition({ fen, depth?, candidateMove? })` → wraps `lib/engine/stockfish.ts`
  - `showBoard({ fen, arrows?, caption? })` → no `execute`; render-only client tool (assistant-ui `makeAssistantToolUI` registers the renderer)
- **assistant-ui chat surface** with built-in attachment-tray composer via `SimpleImageAttachmentAdapter`. Default textarea, paste-image puts a thumbnail chip above with an X to remove, text + image send as one user message.
- **No persistence in Plan 3.** Refresh = fresh chat. Plan 4 adds Dexie.
- **No interactive tools** (`showOptions` / `editPosition`) in Plan 3. Plan 6 adds them.

**Tech Stack:** AI SDK v6 (`ai`@^6, `@ai-sdk/google`@^3 — already installed), `@assistant-ui/react`, `@assistant-ui/react-ai-sdk`, existing chessground `Board` component, existing lib/engine + lib/vision functions, Tailwind v4 + shadcn (already in place).

---

## Reference docs

- `AGENTS.md` — read first; especially the model policy (Flash Lite default; Pro Preview reserved for reasoning-heavy work), the FP rules (14-16), and the structured-output rule
- Spec: `docs/superpowers/specs/2026-05-16-chess-screenshot-analyzer-design.md`
  - Section 4.1 — tool palette (Plan 3 implements `analyzePosition` + `showBoard`; `parseScreenshot`/`showOptions`/`editPosition` deferred per slice plan)
  - Section 4.2 — model strategy (Flash Lite for the agent loop in v0; escalation deferred)
  - Section 4.3 — context strategy (full history; Gemini implicit caching does the work)
  - Section 4.4 — system prompt 8-section structure
  - Section 4.5 — tool design conventions
  - Section 5.2-5.4 — composer / paste UX / tool UI rendering

---

## File structure

**New files (server):**
- `lib/agent/system-prompt.ts` — exports `SYSTEM_PROMPT: string`. The agent's instructions (8-section structure per spec 4.4).
- `lib/agent/tools.ts` — exports `tools: ToolSet` with `analyzePosition` and `showBoard` definitions.
- `app/api/chat/route.ts` — POST handler. Does the image-parse pre-pass, calls `streamText` with the tools + system prompt, returns the UI message stream.

**New files (client):**
- `components/chat/show-board-tool-ui.tsx` — `makeAssistantToolUI` registration that renders our existing `<Board />` for `showBoard` tool calls.
- `components/chat/chat-surface.tsx` — assistant-ui `Thread` wrapped with `AssistantRuntimeProvider` + `useChatRuntime` against `/api/chat`. Includes the attachment-tray composer.

**Modified files:**
- `app/page.tsx` — replace the current paste-button + Analyze-button layout with `<ChatSurface />`.
- `app/layout.tsx` — no changes needed (chat root is a regular client component).
- `next.config.ts` — ensure `outputFileTracingIncludes` covers `@se-oss/stockfish` for the `/api/chat` route (already covered for `/api/analyze`; we add `/api/chat` to the same glob).
- `package.json` — adds `@assistant-ui/react`, `@assistant-ui/react-ai-sdk`.

**Deleted files (vertical-slice cleanup — old endpoints replaced):**
- `app/api/analyze/route.ts`, `app/api/analyze/route.test.ts`
- `app/api/parse-screenshot/route.ts`, `app/api/parse-screenshot/route.test.ts`

The underlying `lib/engine/stockfish.ts` `analyzePosition` and `lib/vision/parse-screenshot.ts` `parseScreenshot` functions stay — they're now called from `app/api/chat/route.ts` (the pre-pass) and from `lib/agent/tools.ts` (the tool wrapper).

**Tests:** Plan 3 adds **zero new tests** (per principle #4). The underlying domain functions in `lib/engine/` and `lib/vision/` are already tested. The agent loop and chat UI are qualitatively tested by use + the eval loop in Plan 10. Two existing test files (`app/api/analyze/route.test.ts` and `app/api/parse-screenshot/route.test.ts`) are deleted because their routes are deleted — the function-level tests in `lib/` already cover what those route tests asserted.

---

## Prerequisites

```bash
cd /Users/mark/Projects/chess-screenshot-analyzer
node --version    # v24.x
git status        # clean
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test   # all green
git log -1        # confirm latest is `ddfa142 docs: Plan 2 SHIPPED…` or newer
```

If any check fails, fix before proceeding.

---

## Task 1: Install assistant-ui dependencies

**Files:** `package.json`, `pnpm-lock.yaml` (auto-updated)

- [ ] **Step 1: Install runtime deps**

```bash
pnpm add @assistant-ui/react@latest @assistant-ui/react-ai-sdk@latest
```

- [ ] **Step 2: Verify imports**

```bash
node -e "import('@assistant-ui/react').then(m => console.log('assistant-ui keys:', Object.keys(m).slice(0, 10)));"
node -e "import('@assistant-ui/react-ai-sdk').then(m => console.log('react-ai-sdk keys:', Object.keys(m).slice(0, 10)));"
```

Expected: each prints exported names; `useChatRuntime`, `AssistantRuntimeProvider`, `Thread`, `ComposerPrimitive`, `makeAssistantToolUI` should all be present in `@assistant-ui/react` (or its sub-paths — verify via Context7 if any aren't where the plan expects).

- [ ] **Step 3: Verify pipeline still passes** (no source changed yet)

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore: add @assistant-ui/react + @assistant-ui/react-ai-sdk for Plan 3

assistant-ui v6+ ships the AI-SDK-v6 UIMessage runtime (useChatRuntime)
and the makeAssistantToolUI registration we need for the showBoard
client tool. Per AGENTS.md it pairs with our existing ai@6 + @ai-sdk/google.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: System prompt

**Files:**
- Create: `lib/agent/system-prompt.ts`

- [ ] **Step 1: Create `lib/agent/system-prompt.ts`** with exactly:

```ts
// Coach system prompt. 8-section structure per spec Section 4.4.
// Pure data — testable by reading; no logic to unit-test.
//
// When iterating (Plan 10's eval loop), edit the sections below; do NOT
// scatter coaching guidance across multiple files or inject extra prompts
// from tool definitions. The prompt is the agent's source of truth.

export const SYSTEM_PROMPT = `# Identity
You are a chess coach: conversational, mobile-first, never condescending. Helpful > friendly > sycophantic. Corrections happen because the user is respected; praise is earned.

# Hard rules
- NEVER evaluate a move's quality, claim a position is winning, or suggest a specific move without first calling the analyzePosition tool. The engine is ground truth.
- NEVER invent or guess a FEN. If a parsed position is already in the conversation as a "FEN:" note, use it. If not, ask the user to share a board.
- NEVER agree with a user-proposed move without engine confirmation.
- Disagreement is helpful; sycophancy is harmful. If analyzePosition shows a user move is bad, say so directly and explain why.

# Tool guidance
- analyzePosition({ fen, candidateMove? }) — call this whenever you need to know the best move in a position, evaluate whether a specific move is good, or determine an evaluation. Engine is Stockfish at depth 14. The result includes bestMove (UCI), evalCp (positive = White better), depth.
- showBoard({ fen, arrows?, caption? }) — render a chess board inline in your message. Use this any time you'd otherwise describe a position in prose. Arrows are { from: Square, to: Square, color?: "green"|"red"|"blue"|"yellow" } — green for the best move, red for the user's worse alternative.

# Workflow
When the user shares a position (a "FEN:" note will be present in conversation context), the typical turn:
1. If the user asked a specific question, answer it directly using analyzePosition.
2. Show the position visually with showBoard. Add an arrow for the best move.
3. Keep prose to 1-3 short paragraphs. Mobile screen.

# Output contract
- Short paragraphs. No walls of text. Mobile-first.
- Board diagrams over prose descriptions whenever spatial info is in play.
- Never repeat the FEN in prose; that's what showBoard is for.

# Tone
- Friendly and direct. Conversational, not lecturing.
- Correct mistakes plainly: "Nf3 actually loses a pawn here because…" not "Great question! Let me reconsider…"
- Praise specific things, not the user generally.

# Recovery
- If the parsed FEN looks wrong to you (impossible piece counts, kings missing), say so and ask the user to verify.
- If analyzePosition returns engine_timeout or engine_error, acknowledge and try once more; if it fails twice, give the user your best high-level read of the position without claiming an evaluation.

# Examples

User: "What should I play?" (with a "FEN:" note in conversation context)

Assistant calls analyzePosition({ fen }) → bestMove "e4d5" (capturing). Then replies:

"You can grab a pawn with dxe5, but the cleanest move is taking the knight on c6 — exd5 wins back the tempo and your bishop on g5 keeps the pressure on Black's queen."

Then calls showBoard({ fen, arrows: [{ from: "e4", to: "d5", color: "green" }], caption: "Best: exd5" }).

End. Total agent turn: two tool calls + 2-3 sentences.
`;
```

- [ ] **Step 2: Verify pipeline still passes**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

- [ ] **Step 3: Commit**

```bash
git add lib/agent/system-prompt.ts
git commit -m "$(cat <<'EOF'
feat(agent): system prompt (8-section structure per spec 4.4)

Pure data, no logic. The agent's source of truth — when iterating in
Plan 10's eval loop, edit this file; do NOT scatter coaching guidance
across tool definitions or system instructions in tool execute fns.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Tool definitions (analyzePosition + showBoard)

**Files:**
- Create: `lib/agent/tools.ts`

The two tools the agent loop can invoke. `analyzePosition` wraps the lib/engine function (compute, server-side execute). `showBoard` is render-only (no execute) — the model emits the call and assistant-ui's `makeAssistantToolUI` renders it client-side.

- [ ] **Step 1: Create `lib/agent/tools.ts`** with exactly:

```ts
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { analyzePosition as runAnalyzePosition } from "@/lib/engine/stockfish";
import { FenSchema } from "@/lib/engine/types";

const UciMoveSchema = z
  .string()
  .regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Invalid UCI move");

const AnalyzePositionArgs = z.object({
  fen: FenSchema,
  candidateMove: UciMoveSchema.optional(),
  depth: z.number().int().min(8).max(22).optional(),
});

const ArrowSchema = z.object({
  from: z.string().regex(/^[a-h][1-8]$/, "from must be a square like e2"),
  to: z.string().regex(/^[a-h][1-8]$/, "to must be a square like e4"),
  color: z.enum(["green", "red", "blue", "yellow"]).optional(),
});

const ShowBoardArgs = z.object({
  fen: FenSchema,
  arrows: z.array(ArrowSchema).max(8).optional(),
  caption: z.string().max(120).optional(),
});

export const tools: ToolSet = {
  analyzePosition: tool({
    description:
      "Run Stockfish on a chess position. Returns the engine's best move (UCI), evaluation (centipawns, positive = White better), depth reached, and optionally a candidate-move verdict. Call this whenever you need to know what's best in a position, evaluate a specific move, or claim a position is winning/losing.",
    inputSchema: AnalyzePositionArgs,
    execute: async ({ fen, candidateMove, depth }) =>
      runAnalyzePosition({
        fen,
        depth: depth ?? 14,
        ...(candidateMove !== undefined && { candidateMove }),
      }),
  }),
  showBoard: tool({
    description:
      "Render a chess board visually in your message. Use this whenever spatial information is in play — pointing at a square, showing the best move with an arrow, illustrating a tactic. Prefer this over describing positions in prose. Arrows: green = best move, red = blunder, blue/yellow = alternatives.",
    inputSchema: ShowBoardArgs,
    // No execute — render-only client tool. assistant-ui's makeAssistantToolUI
    // renders it via components/chat/show-board-tool-ui.tsx (Task 5).
  }),
};
```

Notes:
- `analyzePosition`'s `runAnalyzePosition` takes `unknown` and validates with `AnalyzeInputSchema` internally; we re-validate at the tool layer with Zod (`AnalyzePositionArgs`) so the agent gets clear schema errors at the AI SDK boundary. The double-validation is intentional — the tool-arg schema is the **agent-facing contract**; the engine-input schema is the **engine-facing contract**.
- `showBoard` has no `execute`. AI SDK v6 treats tools without `execute` as client-side: the tool call streams to the UI, the registered `makeAssistantToolUI` component renders it, and no tool-result is generated server-side (the agent stops after the call unless instructed otherwise — see `stopWhen` in Task 4).
- We do NOT wrap `parseScreenshot` as a tool. The pre-pass in `/api/chat` runs it before the agent loop and injects a `FEN:` system note. Per spec section 4.3 context strategy: simpler agent logic, parse always runs when an image is present (the only case it should).

- [ ] **Step 2: Verify pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

- [ ] **Step 3: Commit**

```bash
git add lib/agent/tools.ts
git commit -m "$(cat <<'EOF'
feat(agent): tool palette for Plan 3 — analyzePosition + showBoard

analyzePosition wraps lib/engine/stockfish; server execute.
showBoard is render-only — no execute; client renders via
makeAssistantToolUI in Task 5.

parseScreenshot is NOT a tool. The /api/chat route pre-parses any
image attachment via lib/vision/parse-screenshot and injects FEN
into the agent's context as a system note. Simpler than threading
image bytes through tool args.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `/api/chat` streaming route

**Files:**
- Create: `app/api/chat/route.ts`
- Modify: `next.config.ts` (add `/api/chat` to the existing Stockfish tracing-includes glob)

- [ ] **Step 1: Create `app/api/chat/route.ts`** with exactly:

```ts
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from "ai";
import { google } from "@ai-sdk/google";
import { parseScreenshot } from "@/lib/vision/parse-screenshot";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { tools } from "@/lib/agent/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

// Per AGENTS.md "Gemini model policy": Flash Lite is the default for the
// agent loop in v0. Escalation to gemini-3.1-pro-preview is reserved for
// later plans (10's eval loop) via prepareStep.
const MODEL = google("gemini-3.1-flash-lite");

// Helper: extract image attachments from a UI message's parts.
type ImageAttachment = { readonly mediaType: string; readonly imageBase64: string };
const extractImages = (msg: UIMessage): readonly ImageAttachment[] =>
  (msg.parts ?? []).flatMap((part): readonly ImageAttachment[] => {
    if (part.type !== "file") return [];
    const f = part as { type: "file"; mediaType?: string; url?: string; data?: string };
    if (!f.mediaType?.startsWith("image/")) return [];
    // assistant-ui's SimpleImageAttachmentAdapter sends a `url` data URL
    // (`data:image/png;base64,XXX`) or, in newer versions, a `data` base64 field.
    const b64 = f.data ?? f.url?.split(",")[1];
    if (b64 === undefined || b64 === "") return [];
    return [{ mediaType: f.mediaType, imageBase64: b64 }];
  });

// Pre-pass: for the latest user message with image attachments, call
// parseScreenshot once and produce a system note for the agent. Returns the
// note string (empty if no images / parse failed — agent handles gracefully).
const buildFenContext = async (messages: readonly UIMessage[]): Promise<string> => {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  const images = extractImages(lastUser);
  if (images.length === 0) return "";
  // Parse only the first image. Multi-image messages are unusual; revisit if needed.
  const [img] = images;
  if (!img) return "";
  const result = await parseScreenshot({
    imageBase64: img.imageBase64,
    mimeType: img.mediaType,
  });
  if (!result.ok) return `FEN-parse: failed (${result.reason}). Ask the user to clarify the position.`;
  return `FEN: ${result.data.fen}\nSide to move: ${result.data.sideToMove}`;
};

export async function POST(req: Request): Promise<Response> {
  const { messages }: { messages: UIMessage[] } = (await req.json()) as { messages: UIMessage[] };

  const fenContext = await buildFenContext(messages);

  const result = streamText({
    model: MODEL,
    system: fenContext !== "" ? `${SYSTEM_PROMPT}\n\n# Current context\n${fenContext}` : SYSTEM_PROMPT,
    messages: convertToModelMessages(messages),
    tools,
    // Bound the loop. 8 steps is generous for: parse-pre-pass already done,
    // then analyzePosition + showBoard + optional second analyzePosition for
    // a candidate-move comparison + final prose response.
    stopWhen: stepCountIs(8),
    providerOptions: {
      google: { thinkingConfig: { thinkingLevel: "low" } },
    },
  });

  return result.toUIMessageStreamResponse({
    // ensures the stream finishes server-side even if the client disconnects
    // (important for mobile PWAs — phone calls, app-switching).
    consumeSseStream: async ({ stream }) => {
      for await (const _chunk of stream) { /* drain */ }
    },
  });
}
```

Notes:
- `extractImages` is defensive about the assistant-ui attachment-part shape because the data property name evolved across versions; the helper tries both. Verify against the installed `@assistant-ui/react-ai-sdk` types if it fails. The fix is one-line if so.
- `consumeSseStream` matches AI SDK v6's documented disconnect-resilience pattern. If the exact prop name differs in 6.0.184 (the version Plan 2 installed), check the AI SDK docs via Context7 and adjust.
- We don't `await` `parseScreenshot` in parallel with the agent stream — the user's first token waits for parseScreenshot to complete (~2.2s per Plan 2 testing). That's an acceptable price for v0; a future optimization is to stream a "parsing your position…" intermediate message while the parse runs.

- [ ] **Step 2: Modify `next.config.ts`** to add `/api/chat` to the Stockfish tracing-includes glob.

Read the current file:

```bash
cat next.config.ts
```

Find the `outputFileTracingIncludes` block. It currently has:

```ts
outputFileTracingIncludes: {
  "/api/analyze": ["./node_modules/@se-oss/stockfish/dist/**/*"],
},
```

Change to:

```ts
outputFileTracingIncludes: {
  "/api/chat": ["./node_modules/@se-oss/stockfish/dist/**/*"],
},
```

(The `/api/analyze` key is removed because Task 7 deletes that route. The `/api/chat` route is now the one that needs Stockfish bundled.)

- [ ] **Step 3: Verify pipeline + local smoke**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
git diff tsconfig.json
# If non-empty: git checkout -- tsconfig.json
```

Local smoke (route is reachable, returns a stream):

```bash
pnpm dev &
PNPM_DEV_PID=$!
sleep 6
curl -s -X POST http://localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"What is 1+1?"}]}]}' \
  --max-time 30 | head -c 200
echo
kill $PNPM_DEV_PID 2>/dev/null
wait 2>/dev/null
```

Expected: streaming chunks come back (the stream format is binary-ish — you'll see UIMessage stream events). HTTP not necessarily 200 in head — we just want to see something stream out.

- [ ] **Step 4: Commit**

```bash
git add app/api/chat/route.ts next.config.ts
git commit -m "$(cat <<'EOF'
feat(api): /api/chat — streaming agent loop via AI SDK v6

Pre-pass parses any image attachment via parseScreenshot and injects
the FEN as a system note before invoking streamText. Agent gets two
tools (analyzePosition + showBoard) and a stepCountIs(8) loop budget.
Model: gemini-3.1-flash-lite with thinkingLevel: 'low' (per AGENTS.md
model policy).

next.config.ts: moved Stockfish outputFileTracingIncludes from
/api/analyze (about to be deleted) to /api/chat.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `showBoard` client tool UI

**Files:**
- Create: `components/chat/show-board-tool-ui.tsx`

assistant-ui renders client-side tool calls via `makeAssistantToolUI`. The component is registered at app root (Task 6) so it's available everywhere, including history replay.

- [ ] **Step 1: Create `components/chat/show-board-tool-ui.tsx`** with exactly:

```tsx
"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { Board, type BoardArrow } from "@/lib/chess/board";

interface ShowBoardArgs {
  readonly fen: string;
  readonly arrows?: readonly { readonly from: string; readonly to: string; readonly color?: BoardArrow["brush"] }[];
  readonly caption?: string;
}

// Server-side tools without `execute` produce a tool call but no result.
// assistant-ui renders the call. We map the agent's color → our Board brush.
const toBoardArrows = (arrows: ShowBoardArgs["arrows"]): readonly BoardArrow[] =>
  (arrows ?? []).map((a) => ({
    orig: a.from,
    dest: a.to,
    ...(a.color !== undefined && { brush: a.color }),
  }));

export const ShowBoardToolUI = makeAssistantToolUI<ShowBoardArgs, never>({
  toolName: "showBoard",
  render: ({ args }) => (
    <div className="my-2 flex flex-col items-center gap-1">
      <Board fen={args.fen} arrows={toBoardArrows(args.arrows)} />
      {args.caption !== undefined && args.caption !== "" ? (
        <p className="text-muted-foreground text-xs">{args.caption}</p>
      ) : null}
    </div>
  ),
});
```

Notes:
- The `BoardArrow` type from `lib/chess/board.tsx` has `{ orig, dest, brush? }`. We adapt the agent's `{ from, to, color? }` to that shape here at the boundary — the agent's contract is more natural (`from`/`to`/`color`) than chessground's internal vocabulary.
- The `<Board />` component is the same one Plan 1 built. It already handles `viewOnly` and renders cleanly inside a message bubble.

- [ ] **Step 2: Verify pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
```

- [ ] **Step 3: Commit**

```bash
git add components/chat/show-board-tool-ui.tsx
git commit -m "$(cat <<'EOF'
feat(chat): showBoard client tool UI via makeAssistantToolUI

Render-only — no execute, no result. The agent emits a showBoard
call with { fen, arrows?, caption? }; assistant-ui invokes this
component inline in the assistant message. Wraps the Plan 1 Board
component; adapts arrow {from,to,color} → chessground's {orig,dest,brush}.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Chat surface + attachment composer

**Files:**
- Create: `components/chat/chat-surface.tsx`
- Modify: `app/page.tsx` (replace contents)

assistant-ui's `Thread` ships the message list + composer; we wrap with `AssistantRuntimeProvider` and a `useChatRuntime` pointed at `/api/chat`. The composer's image-attachment behavior is the `SimpleImageAttachmentAdapter` — thumbnails appear above the textarea on paste/upload.

- [ ] **Step 1: Create `components/chat/chat-surface.tsx`** with exactly:

```tsx
"use client";

import {
  AssistantRuntimeProvider,
  Thread,
  Composer,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { SimpleImageAttachmentAdapter } from "@assistant-ui/react";
import { ShowBoardToolUI } from "./show-board-tool-ui";

export const ChatSurface = (): React.JSX.Element => {
  const runtime = useChatRuntime({
    api: "/api/chat",
    adapters: {
      attachments: new SimpleImageAttachmentAdapter(),
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* Register client tools at app root — required for history replay
          per spec §5.3 / assistant-ui docs. */}
      <ShowBoardToolUI />
      <main className="flex min-h-dvh flex-col pb-[env(safe-area-inset-bottom)]">
        <Thread />
      </main>
    </AssistantRuntimeProvider>
  );
};
```

Notes:
- The import paths for `SimpleImageAttachmentAdapter` and the other primitives may differ in your installed `@assistant-ui/react` version. Verify against `node_modules/@assistant-ui/react/dist/index.d.ts` — if the adapter is at `@assistant-ui/react/edge` or similar, adjust the import. Do NOT add `any` or `@ts-ignore`.
- `Thread` includes the composer by default. If we want to customize the composer (a different placeholder, branded styling), we'd wrap with `Composer` primitive separately — but for Plan 3 the default is fine.

- [ ] **Step 2: Replace `app/page.tsx`** with exactly:

```tsx
import { ChatSurface } from "@/components/chat/chat-surface";

export default function Home(): React.JSX.Element {
  return <ChatSurface />;
}
```

- [ ] **Step 3: Verify pipeline + local smoke**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
git diff tsconfig.json
# If non-empty: git checkout -- tsconfig.json
```

Local smoke (open browser, manual click-test):

```bash
pnpm dev &
PNPM_DEV_PID=$!
sleep 6
echo "Open http://localhost:3000 in a browser, type 'hi' and press Enter."
echo "Expected: assistant streams back a response."
echo "Press Ctrl+C when done."
wait $PNPM_DEV_PID
```

If the chat doesn't render, the most likely cause is a CSS import missing (assistant-ui has its own base CSS). Check `node_modules/@assistant-ui/react/dist/styles/index.css` and import it in `app/globals.css` if needed.

- [ ] **Step 4: Commit**

```bash
git add components/chat/chat-surface.tsx app/page.tsx
git commit -m "$(cat <<'EOF'
feat(chat): assistant-ui Thread surface + image-attachment composer

ChatSurface wires:
- useChatRuntime → /api/chat
- SimpleImageAttachmentAdapter for paste/upload image input (thumbnail
  appears above the composer; default textarea-with-tray UX, exactly
  the ChatGPT/Claude pattern)
- ShowBoardToolUI registered at root for history replay

app/page.tsx now renders just <ChatSurface />. Plan 1's hardcoded
board + Plan 2's paste-button-Analyze-button layout are gone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Delete old single-purpose routes

The `/api/analyze` and `/api/parse-screenshot` routes are dead after Plan 3 — the agent calls the underlying lib/ functions directly via tools + pre-pass. Vertical-slice principle: replace cleanly, don't carry parallel paths.

**Files:**
- Delete: `app/api/analyze/route.ts`
- Delete: `app/api/analyze/route.test.ts`
- Delete: `app/api/parse-screenshot/route.ts`
- Delete: `app/api/parse-screenshot/route.test.ts`

(The empty `app/api/analyze/` and `app/api/parse-screenshot/` directories will be cleaned up automatically by `git rm`.)

- [ ] **Step 1: Remove the four files**

```bash
git rm app/api/analyze/route.ts \
       app/api/analyze/route.test.ts \
       app/api/parse-screenshot/route.ts \
       app/api/parse-screenshot/route.test.ts
```

- [ ] **Step 2: Verify pipeline (with the routes gone, no orphaned references)**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test
```

Expected: all green. If a remaining file references the deleted routes (e.g., an old import in `app/page.tsx` that we missed), fix it. The `pnpm test` count should drop from 28 to ~21 (the two route test files together held ~7 tests).

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor: remove /api/analyze and /api/parse-screenshot routes

Replaced by /api/chat (Plan 3): the agent's analyzePosition tool wraps
lib/engine/stockfish directly; lib/vision/parse-screenshot runs in the
route's pre-pass. The underlying lib/ functions stay — they're tested
where they live; the deleted route-test files were thin HTTP wrappers
testing plumbing that AI SDK + Next.js now own.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Deploy + production smoke

**Files:** none

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Watch CI**

```bash
gh run watch --exit-status 2>&1 | tail -10
```

Both CI and Security workflows must pass.

- [ ] **Step 3: Wait for Vercel auto-deploy**

```bash
until /Users/mark/Library/pnpm/vercel ls 2>&1 | awk 'NR==5 && $4=="Ready" {found=1} END {exit !found}'; do sleep 5; done
NEW=$(/Users/mark/Library/pnpm/vercel ls 2>&1 | awk 'NR==5 {print $3}')
echo "Ready: $NEW"
```

- [ ] **Step 4: Production smoke**

```bash
PROD="$NEW"
echo "=== HTML page (chat surface should render) ==="
curl -sI "$PROD/" | head -1
echo "=== /api/chat — text-only message smoke ==="
curl -s -X POST "$PROD/api/chat" \
  -H 'content-type: application/json' \
  -d '{"messages":[{"id":"1","role":"user","parts":[{"type":"text","text":"What is 1+1?"}]}]}' \
  --max-time 30 -w '\nHTTP %{http_code}\n' | head -c 400
echo
echo "=== Plan 1+2 endpoints should now 404 (deleted) ==="
curl -s -o /dev/null -w 'GET /api/analyze: HTTP %{http_code}\n' "$PROD/api/analyze"
curl -s -o /dev/null -w 'GET /api/parse-screenshot: HTTP %{http_code}\n' "$PROD/api/parse-screenshot"
```

Expected: HTML 200; `/api/chat` returns a stream (status 200 with binary-ish chunks); the old endpoints return 404 or 405.

- [ ] **Step 5: Manual phone test (Mark)**

Open the production URL on iPhone Safari:
- Confirm the chat surface renders with a composer at the bottom
- Type "hi" and send — assistant should respond (this exercises the agent loop with no tools needed)
- Copy a chess screenshot to the clipboard; in the composer, tap the attach button (or paste); confirm a thumbnail appears above the textarea
- Send (optionally with a caption like "what should I play?")
- Within ~5-10s, expect: assistant streams text response + an inline rendered chess board with an arrow indicating the best move

If anything breaks at this stage, capture the exact error and inspect Vercel function logs:

```bash
/Users/mark/Library/pnpm/vercel logs "$PROD" --expand 2>&1 | tail -50
```

---

## Task 9: Close out — CLAUDE.md + commit

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md's execution-state block**

Edit `CLAUDE.md` and replace the "Active: Plan 3" line with:

```
- **Plan 3 (one-turn coach chat) — SHIPPED.** Production has a single chat surface (assistant-ui Thread + attachment-tray composer). One streaming /api/chat endpoint runs the AI SDK v6 agent loop with two tools (analyzePosition, showBoard); pre-pass calls parseScreenshot when an image attachment is present and injects the FEN into the agent's context. Old /api/analyze and /api/parse-screenshot routes are deleted.
- **Next plan:** Slice 4 — Multi-turn + Dexie persistence. Plan document not yet written.
```

- [ ] **Step 2: Commit + push**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: mark Plan 3 complete; resume marker → Slice 4

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Done

End state of Plan 3:
- Single chat surface on production. Open the URL → typing area + paste/upload affordance. No more parallel paste-button + Analyze-button layout.
- Image paste / upload → thumbnail in composer tray → optional caption → send → server pre-parses image to FEN → agent decides what to do → response streams back with inline rendered board(s) for any spatial info.
- Every step type-checked, lint-clean, format-clean, gitleaks-clean. CI gates merges. The two old route tests are gone (their HTTP plumbing is replaced; the underlying lib functions are still tested).

Plan 4 (multi-turn + Dexie persistence) is next — the chat history starts surviving refresh and the user can have multi-message conversations about the same position without re-uploading.
