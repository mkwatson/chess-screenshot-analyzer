# Chess Screenshot Analyzer — Design Spec

**Date:** 2026-05-16
**Status:** Approved for implementation planning
**Audience:** v0 is for the author personally; architected so any v1+ feature (auth, cloud sync, monetization) is an additive change, not a rewrite.

---

## 1. Product

A Progressive Web App, primarily for Safari on iOS, in which the user pastes a screenshot of a chess position and converses with an AI coach. The coach either gives the best move outright or guides the user through finding it, based on what the user asks for. The interface is a single chat surface; everything else (board diagrams, multiple-choice buttons, position correction) is rendered inline as part of the agent's output.

### 1.1 Operating principles

These principles outrank any individual feature decision. When in doubt, return here.

1. **Lean on trusted libraries, vendors, and platform features.** Custom code requires justification, not the other way around. The differentiator is the *conversation* and the *teaching* — not the engine, the vision pipeline, or the board renderer.
2. **Mobile is a first-class constraint, not a retrofit.** Tiny iOS screen, thumb reach, safe areas, virtual keyboard, paste-from-Photos workflow. Every UX decision passes through this filter.
3. **Highest-bandwidth medium wins.** A board with two arrows beats three sentences of SAN notation; three thumb-tappable buttons beat "type 1, 2, or 3." For any piece of information or interaction, pick the densest representation the medium can carry.
4. **The agent owns the conversation flow.** Confirmations, mode choices, escape hatches — none of these are hardcoded steps in our React app. The agent decides what to ask, when to ask, what to skip, given the context. The shell is dumb on purpose.
5. **Helpful > friendly > sycophantic.** The coach's job is to make the user better at chess, not to make them feel clever. Tone is warm and direct; feedback is honest; praise is earned and specific.
6. **World-class UI/UX, achieved primarily through library selection.** Modern look-and-feel comes from picking the right vendors and using their features fully, not from bespoke design work.
7. **Use every cheap/free feature on the table.** If a tool gives us something for negligible maintenance cost, we use it. Implicit caching, telemetry, persistence hooks, session replay — all on by default if free.

### 1.2 Out of scope for v0

- Authentication, accounts, identity
- Server-side persistence / cloud sync of chats
- Payments, subscriptions, entitlements
- Multi-user features (sharing analyses, etc.)
- Live game play (against engine or human)
- PGN game import (URL paste of Lichess/Chess.com links is in scope via Gemini URL context; bulk PGN import is not)
- Opening books, position databases, master game lookup
- Push notifications

All deferred features should remain *additive* in the architecture — adding any one of them should not require restructuring v0 code.

---

## 2. System architecture

```
┌──────────────────────────────────────────────┐
│                iOS Safari PWA                 │
│  ┌────────────────────────────────────────┐  │
│  │ assistant-ui chat shell + tool UIs:    │  │
│  │   showBoard (chessground render-only)  │  │
│  │   showOptions (tappable buttons)       │  │
│  │   editPosition (editable chessground)  │  │
│  │ Composer w/ paste-image attachment     │  │
│  │ vaul Drawer for chat list + settings   │  │
│  │ Dexie v4 (chats + messages)            │  │
│  │ PostHog autocapture + Session Replay   │  │
│  └────────────┬───────────────────────────┘  │
└───────────────┼──────────────────────────────┘
                │ SSE (resumable)
┌───────────────▼──────────────────────────────┐
│      Vercel Function (Node, Fluid Compute)   │
│  ┌────────────────────────────────────────┐  │
│  │ AI SDK v6 ToolLoopAgent                │  │
│  │ tools:                                  │  │
│  │   parseScreenshot (Gemini Flash vision)│  │
│  │   analyzePosition (Stockfish WASM)     │  │
│  │   showBoard / showOptions /            │  │
│  │     editPosition (render-only)         │  │
│  │ stopWhen: hasToolCall(interactive)     │  │
│  │           || stepCountIs(8)            │  │
│  │ prepareStep: Flash↔Pro routing         │  │
│  │ experimental_telemetry → PostHog       │  │
│  └─────────┬──────────────────────┬───────┘  │
│            │                      │           │
│   ┌────────▼─────────┐   ┌────────▼────────┐ │
│   │ AI Gateway →     │   │ Warm singleton  │ │
│   │ Gemini 3 (Flash, │   │ Stockfish 17.1  │ │
│   │ Pro, Deep Think) │   │ WASM child proc │ │
│   └──────────────────┘   └─────────────────┘ │
└───────────────────────────────────────────────┘
```

**Key shape decisions:**

- **Single Vercel project, single Next.js app.** No separate API service.
- **One streaming endpoint** (`/api/chat`) hosts the entire agent loop. All tools live behind it.
- **Stockfish lives server-side** (per principle #1 — uniform tool surface, no client-side WASM bundle).
- **All tools — compute, render-only, interactive — are AI SDK v6 tools.** The agent treats them identically; the framework dispatches.
- **Chat history is the client's source of truth** (Dexie). The server is stateless; each turn receives the full message history from the client.
- **Gemini implicit/explicit caching** absorbs the cost of sending full history.

---

## 3. Stack (locked-in)

| Layer | Choice | License |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript + Tailwind v4 + shadcn/ui | MIT |
| Hosting | Vercel — Fluid Compute, Node runtime everywhere | — |
| Config | `vercel.ts` via `@vercel/config` (not `vercel.json`) | — |
| LLM gateway | Vercel AI Gateway | — |
| LLM provider | Google AI Studio (Developer API) via `@ai-sdk/google` | — |
| Models | `gemini-3-flash` (chat + vision), `gemini-3.1-pro` (escalation), `gemini-3-deep-think` (rare) | — |
| Agent runtime | Vercel AI SDK v6 `ToolLoopAgent` + `@ai-sdk/react` `useChat` | MIT |
| Chat UI | `assistant-ui` (`makeAssistantToolUI`, `useRemoteThreadListRuntime`) + selected AI Elements components for visual polish | MIT |
| Chess engine | `@se-oss/stockfish` (Stockfish 17.1 WASM, single warm engine, serialized requests) | GPL-3.0 |
| Board renderer | `chessground` (Lichess) wrapped in ~50-line React component | GPL-3.0 |
| Chess logic | `chessops` (Lichess) | GPL-3.0 |
| Piece set | `cburnett` (Lichess default) | CC-BY-SA |
| Persistence | Dexie v4 (`useLiveQuery`, hooks, compound indexes) | Apache-2.0 |
| Mobile chrome | `vaul` (via shadcn `Drawer`) | MIT |
| Toasts | `sonner` | MIT |
| Utility hooks | `usehooks-ts` | MIT |
| Pagination observer | `react-intersection-observer` | MIT |
| Service worker | `@serwist/next` (next-pwa is abandoned) | MIT |
| Observability | PostHog — LLM Analytics (`@posthog/ai/otel`) + Session Replay + Error Tracking + Web Analytics | — |

### 3.1 License posture (chessground + chessops + Stockfish are GPL-3.0)

The app is intended to be public-source — the GitHub repo for this project will be public, satisfying GPL-3.0's source-availability obligation. A `Source` link in the app footer points at the repo. No CLA, no commercial fee, no obstruction.

If the product ever pivots to a closed-source commercial release, the chess libraries swap to `react-chessboard` + `chess.js` (both MIT). Plan for this is a single PR's worth of work given the thin React wrapper isolates the renderer.

### 3.2 Vercel platform features adopted in v0

- **AI Gateway** — wraps Gemini for observability, fallback, ZDR, no markup
- **BotID Basic** — wraps `/api/chat` to block automated abuse
- **Web Analytics + Speed Insights** — free Hobby allotment, auto-pauses at cap
- **Upstash Redis (via Vercel Marketplace)** — exclusively as the resumable-streams store (10-minute TTL keys). Not used as a general cache. Free tier sufficient.
- **Deployment Protection (Vercel Authentication)** on preview deployments — keeps preview URLs private during phone testing; production stays open
- **Preview URLs + QR test loop** — every push gets a URL, dashboard renders QR for phone-install
- **`vercel.ts`** config, `vercel env pull` workflow

### 3.3 Vercel features explicitly deferred

- Vercel Blob (screenshots stored as base64 in Dexie for v0)
- Edge Config (no feature flags or shared config that warrants it; the one PostHog feature flag we use is hosted by PostHog)
- Routing Middleware (no geo/A-B needs)
- Sandbox, Queues, Cron, Rolling Releases, Workflow (no use case)
- Vercel Agent for PR review (solo dev, no PRs)

---

## 4. The agent

### 4.1 Tool palette (5 tools)

All five tools are defined server-side via the AI SDK v6 `tool()` factory. Three execute server-side; two are render-only (no `execute`).

| Tool | Side | Purpose |
|---|---|---|
| `parseScreenshot` | server `execute` | Vision parse: image → `{ fen, sideToMove, castling, confidence, perSquareConfidence[64] }`. Calls Gemini Flash with `media_resolution: HIGH`, `thinking: minimal`, structured output schema. Validates resulting FEN with chessops; on illegal position retries once with error feedback. |
| `analyzePosition` | server `execute` | Stockfish analysis: takes `fen` + optional `candidateMove`. Returns `{ score: { cp\|mate, wdl }, bestMove, principalVariation[], alternatives[], candidateVerdict? }`. Streams `info` events back through the SSE stream as the engine deepens. |
| `showBoard` | render-only | Renders a chessground board inline in a message. Inputs: `{ fen, arrows?: [{from, to, brush}], highlights?: [{square, class}], caption?, orientation? }`. No server execute — the client renders directly. |
| `showOptions` | render-only / interactive | Renders tappable buttons under a message. Inputs: `{ question, choices: [{label, value}] }`. The agent loop pauses; user tap calls `addToolOutput({ choice })`; the loop resumes with the choice as the tool result. |
| `editPosition` | render-only / interactive | Renders an editable chessground for the user to correct a misparsed position. Inputs: `{ fen, reason }`. User edits, taps Confirm, `addToolOutput({ fen })` returns the corrected FEN. |

**Termination:** `stopWhen: hasToolCall('showOptions') || hasToolCall('editPosition') || stepCountIs(8)`. Interactive tools are terminal by definition — the agent has handed off to the user. No wasted Gemini call after the UI handoff.

**No client-side compute tools.** The principle is uniform tool surface; if we later need something the client can do faster (e.g., a position-similarity search using local embeddings), we revisit.

### 4.2 Model strategy

Routed via the Vercel AI Gateway, all calls go through `@ai-sdk/google`.

| Role | Model | `thinkingLevel` | When |
|---|---|---|---|
| Tool routing / interstitial steps | `gemini-3-flash` | `low` | Default for most steps in the loop |
| Vision parse | `gemini-3-flash` | `minimal` | Inside `parseScreenshot.execute` (separate model call from the agent loop) |
| Final coaching response | `gemini-3-flash` | `low` to `medium` | Default. Flash is plenty for ~90% of coaching turns. |
| Deep reasoning escalation | `gemini-3.1-pro` | `high` | When the agent self-determines via `prepareStep` that the position is complex (large eval swings between PV lines, multi-step calculation, or user explicitly asks for depth) |
| Hardest analysis | `gemini-3-deep-think` | (always-on extended) | Reserved; surfaced only if Pro proves insufficient in practice |

**Mid-loop model swap** uses AI SDK v6 `prepareStep({ model })`. The agent doesn't "ask" to escalate — heuristics in `prepareStep` (e.g., presence of `analyzePosition` result with high eval swing) trigger the swap for the final response step.

### 4.3 Context strategy

- **Send full message history every turn.** Gemini's implicit context caching gives ~90% discount on repeated prefixes; structured properly there's no economic benefit to truncation in v0.
- **Stable prefix structure:** every request begins with the same byte-exact system prompt + tool declaration block. Implicit caching kicks in automatically after the first call.
- **Explicit caching** (`cachedContents/{id}`, 1h TTL) for the system prompt + tool declarations once they exceed 32K tokens or implicit cache hits prove insufficient in telemetry. Until then, implicit caching alone is enough.
- **File API for screenshots:** when a user pastes an image, upload via Gemini File API once, reference the URI across `parseScreenshot` and all downstream turns about that position. Avoids re-uploading base64 bytes (which would defeat caching).
- **Tool result shaping:** every tool's `toModelOutput` returns a compact text representation (FEN string, single eval, top-3 PV lines) — never the full UI payload. The rich UI parts live in client state for rendering; the model sees text.
- **Memory:** v0 has no long-term memory beyond message history. v1+ may add Letta/Mem0 as a memory layer; the integration point is a single `loadHistory()` wrapper that the agent endpoint calls. No part of the tool surface changes when memory lands.

### 4.4 System prompt sketch

The system prompt establishes:
- Role: a chess coach, not a chatbot.
- Tone: helpful and direct; corrections happen because the user is respected; no flattery.
- Mobile density rule: prefer showing a board over describing a position in prose; prefer offering `showOptions` over asking the user to type when the question has 2-4 discrete answers; keep prose tight.
- Conversation flow ownership: the agent decides when to confirm a position (using `editPosition` when `parseScreenshot` returns low confidence in key squares), when to offer mode buttons (when the user's intent is genuinely ambiguous), and when to just answer.
- Coaching repertoire: enumerated coaching moves the agent can make — direct answer, single hint, Socratic ladder, candidate-move drill, motif spotting, principle-first, adversarial defense, calculation drill, plan articulation, layered analysis ("club player vs master vs engine"), show-don't-tell. The agent picks contextually.
- Tool descriptions repeated inline with usage guidance, not just signatures — *what does good usage look like* for each tool.
- Style for output: short prose, board diagrams over descriptions, suggestions emitted via the suggestions adapter (not inline in prose).

The full prompt text is implementation detail for the planning step; this spec fixes its shape and responsibilities.

### 4.5 Telemetry

Every `streamText`/`ToolLoopAgent` invocation enables `experimental_telemetry: { isEnabled: true, functionId: 'chess-chat', metadata: { posthog_distinct_id, posthog_trace_id } }`. The PostHog OTel processor (registered in `instrumentation.ts`) exports spans to PostHog LLM Analytics, surfacing:
- Tokens (in, out, cached) per call
- Latency (TTFT, total) per step and per turn
- Cost per call
- Tool call name, duration, success/error per step
- Cache hit rate (Gemini `cachedContentTokenCount`)

These metrics are critical for tuning `prepareStep` heuristics and confirming caching is actually engaged.

---

## 5. Frontend

### 5.1 Information architecture

The PWA is single-route: `/`. There is no navigation in the traditional sense.

- **Chat surface** occupies the full viewport. Composer is fixed at the bottom respecting safe-area-inset-bottom.
- **Chat list** lives in a vaul bottom Drawer with snap points (`['20%', '60%', 1]`), opened by a button in the top-left of the chat shell. The peek snap shows the most recent chats with a board thumbnail.
- **Settings** lives in a vaul bottom Drawer (single-snap), accessed from a button in the top-right.
- **Image preview** (tap the pasted screenshot) opens a shadcn `Dialog` with pinch-zoom — not a Drawer (Drawers near full-height have iOS quirks).

### 5.2 Composer & paste UX

The composer offers two input paths that funnel to the same handler:

1. **"Paste screenshot" affordance** — a dedicated button that invokes `navigator.clipboard.read()` inside the click handler (only path that works on iOS Safari without a physical keyboard).
2. **File picker** (`<input type="file" accept="image/*">`) — fallback inside the same button if clipboard is unavailable or empty.

On desktop, the entire composer is a drop zone. On any device with a physical keyboard, a hidden `contenteditable` listens for paste events.

Pasted images are attached via assistant-ui's `SimpleImageAttachmentAdapter`, which encodes as a data URL on the message. The user can also type a message and send — image plus prompt — or just send the image alone (the agent will react).

### 5.3 Tool UI rendering

All five tool UIs are registered at the app root via `makeAssistantToolUI<Args, Result>({ toolName, render })`. Registration MUST be at app root (not inside a route or conditionally-mounted component) so message replay re-hydrates inline UI without re-running tools.

- **`showBoard`** renders a `<Board fen={args.fen} arrows={args.arrows} highlights={args.highlights} viewOnly />` component (chessground wrapper) inside the message bubble.
- **`showOptions`** renders a row of tappable chips. While `status.type !== 'complete'`, shows a skeleton. On tap, calls `addToolOutput({ choice })`; subsequent re-renders show a "chose: X" badge instead of the chips (so history replay is unambiguous).
- **`editPosition`** renders an editable Board in a vaul Drawer (full-snap) with a Confirm button. On Confirm, calls `addToolOutput({ fen })`. Status follows the same pattern.
- **`parseScreenshot`** and **`analyzePosition`** render progress indicators while running, then their results render contextually (the agent typically follows up with `showBoard` for the parsed position; analysis results are baked into the agent's prose + a `showBoard` with arrows).

`useChat` with `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` resubmits the conversation after an interactive tool result lands, so the agent continues without another user turn.

### 5.4 Suggestions

After the agent's final response in a turn, the suggestions adapter generates 3-4 follow-up chips ("Show the line", "What if I play Nf6?", "Explain the threat"). Tap = send.

### 5.5 Resumable streams

`useChat({ id: chatId, resume: true })` reconnects to in-flight streams when the PWA backgrounds and returns. Stockfish analysis can take 5-15 seconds; an iOS user getting a phone call mid-analysis must not lose the stream. Resumable streams require a server-side stream store — for v0 this is Upstash Redis (provisioned via the Vercel Marketplace), used solely for this purpose with a 10-minute key TTL.

### 5.6 PWA setup

- **Manifest:** `display: 'standalone'`, `viewport-fit: cover`, theme color, 192/512 maskable icons + iOS apple-touch-icon at 180×180, `apple-mobile-web-app-status-bar-style: black-translucent`.
- **Viewport:** `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">`.
- **Heights:** Tailwind `h-dvh` / `min-h-dvh` everywhere; never `h-screen` (which is `100vh`).
- **Safe areas:** `pb-[env(safe-area-inset-bottom)]` on composer; `pt-[env(safe-area-inset-top)]` on top bar.
- **Keyboard:** `interactive-widget=resizes-content` handles most cases; a `--kb` CSS variable computed from `visualViewport` covers the rest for the composer.
- **A2HS:** a one-time dismissible banner detects `display-mode: browser` on iOS Safari and instructs Share → Add to Home Screen. Suppressed when `display-mode: standalone` or when dismissed.
- **Service worker:** `@serwist/next` precaches app shell; `NetworkOnly` for `/api/*`; `StaleWhileRevalidate` for static assets. No Background Sync (not on iOS Safari yet).

### 5.7 Mobile UI minimal set

- `vaul` (via shadcn `Drawer`) — chat list, settings, editPosition
- `sonner` — toasts ("Image pasted", "Analysis failed, retrying...")
- `usehooks-ts` — `useMediaQuery`, `useEventListener` for visualViewport, `useLocalStorage`
- `react-intersection-observer` — chat history pagination inside the Drawer

Explicitly skipped: `framer-motion`, `cmdk`, `react-aria`, `@use-gesture/react` (each redundant with what we have).

---

## 6. Persistence

### 6.1 Storage (Dexie v4)

Two tables, designed with `@`-prefixed IDs so a future migration to Dexie Cloud (managed sync) is config-only.

```ts
db.version(1).stores({
  chats:    '@id, updatedAt',
  messages: '@id, chatId, [chatId+createdAt]',
  meta:     'key',
});
db.chats.hook('creating', (_, o) => { const t = Date.now(); o.createdAt = t; o.updatedAt = t; });
db.chats.hook('updating', () => ({ updatedAt: Date.now() }));
db.messages.hook('creating', (_, o) => { o.createdAt ??= Date.now(); });
```

**Schema:**
- `chats`: `{ id, title, createdAt, updatedAt, lastPositionFen, thumbnailDataUrl }`
- `messages`: `{ id, chatId, role, parts: UIMessagePart[], createdAt, metadata }`

`parts` stores the full assistant-ui message-parts structure (text, tool-`<name>` parts, image attachments) as a typed JSON column. This is rich enough that history replay can re-render every board, every options chip, every edit dialog without re-running any tool.

### 6.2 Repository pattern

A storage-agnostic interface; Dexie is one adapter, a future server-backed implementation is another.

```ts
export interface ChatRepository {
  listChats(): Observable<Chat[]>;
  getMessages(chatId: string): Observable<Message[]>;
  createChat(init: Partial<Chat>): Promise<string>;
  appendMessage(m: Message): Promise<void>;
  updateStreamingMessage(id: string, parts: Part[]): Promise<void>;
  finalizeMessage(id: string, final: Message): Promise<void>;
  deleteChat(id: string): Promise<void>;
  exportAll(): Promise<Blob>;
  importAll(b: Blob): Promise<void>;
}
```

UI imports only the interface; the Dexie implementation lives in `lib/persistence/dexie/`. Server-side replacement later: same interface, new module.

### 6.3 Streaming write pattern

Tokens arrive at 30-100 Hz during a stream; a naive `put` per token janks the main thread. Instead, a coalescer:

```ts
const pending = new Map<string, Message>();
let flushScheduled = false;

function queueStreamUpdate(m: Message) {
  pending.set(m.id, m);
  if (!flushScheduled) {
    flushScheduled = true;
    requestIdleCallback(flush, { timeout: 100 });
  }
}

async function flush() {
  const batch = [...pending.values()];
  pending.clear();
  flushScheduled = false;
  if (batch.length) await db.messages.bulkPut(batch);
}
```

On `onFinish`, immediately flush + atomic update of chat metadata in a transaction:

```ts
db.transaction('rw', db.chats, db.messages, async () => {
  await db.messages.put(finalMessage);
  await db.chats.update(chatId, {
    lastPositionFen,
    thumbnailDataUrl,
    updatedAt: Date.now(),
  });
});
```

On `visibilitychange` to hidden: cancel any pending idle callback and `await` an immediate flush before the page unloads.

### 6.4 assistant-ui integration

`useRemoteThreadListRuntime({ adapter, runtimeHook })` is the official multi-thread plug point.
- `adapter` is a `RemoteThreadListAdapter` whose `list/get/initialize/rename/archive/delete` methods call the `ChatRepository`.
- `runtimeHook` returns a `useChatRuntime({ ... })` with a per-thread history adapter that `load`s and `append`s against the Dexie messages table.

When a user reopens a past chat, assistant-ui replays the messages; because tool UIs are registered globally, every board, options chip, etc. re-renders from stored `parts` — no tool re-execution.

### 6.5 iOS quotas

- Call `navigator.storage.persist()` after first user gesture to resist 7-day eviction.
- Surface `navigator.storage.estimate()` in settings; warn at >70% usage.
- Keep transactions short; iOS Safari aborts long-running ones.

### 6.6 Validation on load

`UIMessage` parts loaded from Dexie pass through `validateUIMessages` with current tool schemas before being handed to `useChat`. Invalid tool parts are stripped (logged), preventing schema drift from breaking history.

---

## 7. Backend — Vercel Functions

### 7.1 `/api/chat` route handler

The single streaming endpoint. Node runtime, Fluid Compute (default).

```ts
export const maxDuration = 60; // P99 stream length cap

export async function POST(req: Request) {
  await checkBotId();  // BotID Basic
  const { messages, id } = await req.json();

  const result = chessAgent.stream({
    messages: convertToModelMessages(messages),
    id,
    experimental_telemetry: { isEnabled: true, ... },
    prepareStep: ({ messages, stepNumber }) => ({
      model: shouldEscalate(messages, stepNumber) ? proModel : flashModel,
    }),
  });

  return result.toUIMessageStreamResponse({
    onFinish: ({ messages: final }) => persistFinalMessages(id, final),
  });
}
```

`chessAgent` is a module-scope `ToolLoopAgent` with `tools`, `instructions` (system prompt), `stopWhen: hasToolCall('showOptions') || hasToolCall('editPosition') || stepCountIs(8)`, and a default model. `prepareStep` selectively swaps to Pro for the final response step on complex positions.

### 7.2 Stockfish engine

Single warm engine per Fluid Compute instance, serialized requests. Pool intentionally avoided — Fluid scales by spawning instances, not by pooling within one.

```ts
// lib/engine/stockfish.ts
let enginePromise: Promise<Stockfish> | null = null;
let inFlight: Promise<unknown> = Promise.resolve();

export function getEngine() {
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

export async function analyzePosition(fen, opts) { /* see audit */ }
```

Defaults: depth 16, `MultiPV: 3` for "best move" queries, `MultiPV: 1` for candidate grading, stream `info` events to the SSE stream, `ucinewgame` between unrelated FENs to reset the hash. Manual cancellation via `engine.send('stop')`.

### 7.3 Vision parse (`parseScreenshot` tool)

```ts
parseScreenshot: tool({
  description: '...',
  inputSchema: z.object({ imageRef: z.string() }),
  execute: async ({ imageRef }) => {
    const result = await generateObject({
      model: google('gemini-3-flash'),
      providerOptions: { google: {
        mediaResolution: 'HIGH',
        thinkingConfig: { thinkingLevel: 'minimal' },
      }},
      schema: parseScreenshotSchema,  // { fen, sideToMove, castling, confidence, perSquareConfidence }
      messages: [{ role: 'user', content: [
        { type: 'image', image: imageRef },
        { type: 'text', text: 'Read this chess position. Return FEN + confidence.' },
      ]}],
    });

    const validation = validatePositionLegality(result.object.fen);
    if (!validation.valid) {
      const retry = await generateObject({ /* same call with error feedback */ });
      // ... return retry or escalate to Pro
    }
    return result.object;
  },
}),
```

`generateObject` is used (not `streamObject`) — the parse is small and the agent waits for the full result before deciding the next step.

When the user message contains a paste, the agent should be steered toward `parseScreenshot` immediately. This is enforced via Gemini's tool config (`mode: 'ANY', allowedFunctionNames: ['parseScreenshot']`) when an image attachment is present in the latest user message.

### 7.4 Resumable streams support

`/api/chat` writes the stream to Upstash Redis (provisioned via Vercel Marketplace, free tier) keyed by `chatId`, so `useChat({ resume: true })` can reattach if the connection drops mid-stream. TTL ~10 minutes. This is the sole use of Redis in v0 — no general caching, no other state.

### 7.5 Environment & config

- `vercel.ts` defines the project (framework, build command, headers).
- `vercel env pull` pulls dev secrets (`GOOGLE_GENERATIVE_AI_API_KEY`, `POSTHOG_KEY`, `AI_GATEWAY_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) to `.env.local`. The Upstash variables are auto-provisioned by the Vercel Marketplace integration.
- Production secrets configured in the Vercel dashboard.

---

## 8. Observability

### 8.1 PostHog wiring

Single provider for LLM Analytics + Session Replay + Error Tracking + Web Analytics.

- **Client:** `posthog-js` with `autocapture`, `session_recording`, `capture_exceptions: true`, `person_profiles: 'identified_only'`. Reverse-proxied via `/ingest` rewrite in `next.config.ts` so ad-blockers don't kill ingestion in the PWA.
- **Server:** `instrumentation.ts` registers `PostHogSpanProcessor` from `@posthog/ai/otel`. AI SDK's `experimental_telemetry` emits OTel spans that get exported.
- **Anonymous IDs:** generated on first load, stored in Dexie `meta`, used as `posthog.identify(anonId)`. Same ID flows into `experimental_telemetry.metadata.posthog_distinct_id`, stitching LLM traces ↔ replays ↔ errors.

### 8.2 PostHog features used

- **LLM Analytics** — tokens, cost, latency, errors per turn and per step; cache hit rate via `cachedContentTokenCount`
- **Session Replay** (5k/mo free) — DOM replay of mobile Safari sessions, invaluable for reproducing iOS-specific UI bugs
- **Error Tracking** — Next.js + AI SDK exceptions auto-captured; source maps uploaded during build
- **Web Analytics** — pageviews, devices, sources (skip Vercel Web Analytics — redundant)
- **One feature flag:** `experimental_coaching_mode` for prompt experiments without redeploys
- **PostHog MCP** (already installed locally) — during development, Claude can pull session replays for a given error, query LLM traces, etc.

Skipped: Surveys, Experiments (no traffic for stat-sig tests at v0).

---

## 9. Build sequence (high-level)

Detailed implementation plan comes next via the writing-plans skill. This is the build order so the plan can structure itself.

1. **Skeleton.** Next.js + TS + Tailwind + shadcn/ui + Vercel deployment. `vercel.ts`, env, BotID, Analytics, Speed Insights wired but inert.
2. **Persistence layer.** Dexie schema, repository interface + Dexie adapter, streaming-write coalescer. Unit-testable in isolation.
3. **Chess libs.** Thin Board React wrapper around chessground; cburnett piece set; chessops integration helpers.
4. **Stockfish.** Warm singleton + `analyzePosition` server function. Test with hardcoded FENs.
5. **Agent shell.** `/api/chat` with `ToolLoopAgent`, all five tools defined (compute tools wired to real implementations; render-only tools as stub schemas). System prompt v1. AI Gateway + Gemini provider.
6. **Chat UI.** assistant-ui shell, tool UIs registered at app root, `useChat` wired to `/api/chat`, multi-thread runtime backed by Dexie repository.
7. **Composer.** Paste-image handler, attachment adapter, drop zone, file picker fallback.
8. **PWA.** Manifest, `@serwist/next`, A2HS banner, safe-area styling, visualViewport keyboard handling.
9. **Resumable streams.** Vercel KV stream store, `useChat({ resume: true })`.
10. **Suggestions.** Suggestion adapter wired to a small Gemini Flash call after each agent response.
11. **Observability.** PostHog client init, `@posthog/ai/otel` server, source maps in build.
12. **Polish.** sonner toasts, vaul drawers for chat list + settings, edit-position drawer, image preview dialog, keyboard handling edges, persist-storage request, exposed export.
13. **System prompt iteration.** Use telemetry + session replays to tune the coaching prompt and `prepareStep` escalation heuristics.

Each step from (5) onward is shippable to a Vercel preview URL for phone testing.

---

## 10. Open considerations for v1+

- **Cloud sync of chats** — add Dexie Cloud (config-only swap), or implement the server-side `ChatRepository` adapter against Neon + Clerk for Google SSO.
- **Long-term memory** — Letta/Mem0 behind a `loadHistory()` wrapper at the agent endpoint.
- **PGN game upload + game review** — multi-position analysis with annotations, branching tree.
- **Opening explorer integration** — Lichess opening DB API.
- **Position similarity / pattern recognition** — Gemini embeddings over FEN-derived position descriptors; "have I seen this position before?"
- **Voice input** — assistant-ui's `DictationAdapter` for hands-free analysis.
- **Public release / commercialization** — license decision on chess libs (stay GPL, or swap to MIT alternatives).

---

## Appendix A — Principles checklist (for code review)

When implementing, every PR should pass these:

- [ ] Is there an existing library that does this? Did we consider it before writing custom code?
- [ ] Is this conversation logic? If yes, is it in the system prompt, not in React?
- [ ] Does this work on iOS Safari in standalone PWA mode? Tested on the preview URL?
- [ ] If the agent emits text, would a board or a button render the information better?
- [ ] If we're sending bytes to Gemini, is the prefix still cache-friendly?
- [ ] If we're writing to Dexie during a stream, are we coalescing?
- [ ] If we're adding a tool, is it registered at app root for replay correctness?
- [ ] If we're adding a vendor, what does it give us for free that we're not yet using?
