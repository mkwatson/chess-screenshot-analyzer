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

### 3.1 Vendor account provisioning

All vendor accounts are provisioned as siblings under the existing Vidably organization/team where applicable, with fresh credentials per service and zero shared state with production Vidably resources. Concretely:

- **Vercel:** a new project under the Vidably team. Separate domain, separate env vars, separate deploy hooks.
- **PostHog:** a new project within the Vidably organization. Separate API key, separate event stream. Dashboards stay isolated.
- **Google AI Studio:** a separate API key in a separate Google Cloud project under the Vidably account.
- **Upstash Redis:** a separate database provisioned via the Vercel Marketplace integration for this project.
- **GitHub:** a separate repository.

This is free, one-click in each platform's UI, and keeps the project's billing/logs/data physically isolated from Vidably's production work. No complexity tax.

### 3.2 License posture (chessground + chessops + Stockfish are GPL-3.0)

The app is intended to be public-source — the GitHub repo for this project will be public, satisfying GPL-3.0's source-availability obligation. A `Source` link in the app footer points at the repo. No CLA, no commercial fee, no obstruction.

If the product ever pivots to a closed-source commercial release, the chess libraries swap to `react-chessboard` + `chess.js` (both MIT). Plan for this is a single PR's worth of work given the thin React wrapper isolates the renderer.

### 3.3 Vercel platform features adopted in v0

- **AI Gateway** — wraps Gemini for observability, fallback, ZDR, no markup
- **BotID Basic** — wraps `/api/chat` to block automated abuse
- **Web Analytics + Speed Insights** — free Hobby allotment, auto-pauses at cap
- **Upstash Redis (via Vercel Marketplace)** — exclusively as the resumable-streams store (10-minute TTL keys). Not used as a general cache. Free tier sufficient.
- **Deployment Protection (Vercel Authentication)** on preview deployments — keeps preview URLs private during phone testing; production stays open
- **Preview URLs + QR test loop** — every push gets a URL, dashboard renders QR for phone-install
- **`vercel.ts`** config, `vercel env pull` workflow

### 3.4 Vercel features explicitly deferred

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

Routed via the Vercel AI Gateway, all calls go through `@ai-sdk/google`. **Posture: default Flash, escalate to Pro on Stockfish-output heuristics.** Not the other way around.

| Role | Model | `thinkingLevel` | When |
|---|---|---|---|
| Tool routing / interstitial steps | `gemini-3-flash` | `low` (or off) | Default for most steps in the loop. Thinking adds latency without quality lift on one-shot tool selection. |
| Vision parse | `gemini-3-flash` | `minimal` | Inside `parseScreenshot.execute` (separate model call from the agent loop). Verify with chessops legality check instead of letting the model reason longer. |
| Final coaching response (default) | `gemini-3-flash` | `low` | Default. Flash matches 2.5 Pro on most benchmarks and is plenty for synthesizing pre-computed Stockfish analysis into prose. |
| Final coaching response (sharp position) | `gemini-3.1-pro` | `medium` | Triggered via `prepareStep` heuristics on Stockfish output (see below). Multi-candidate explanation needs comparison reasoning. |
| Async "deeper look" affordance | `gemini-3-deep-think` | (always-on extended) | NEVER in the user-facing critical path. Surfaced only as an optional CTA after a Pro answer ("want a deeper analysis?"). |

**Escalation heuristics inside `prepareStep`.** Implemented as deterministic rules on tool results — not model self-judgment, not a router LLM (both add cost or latency without measurable benefit; Stockfish's output is a quantitative difficulty oracle the LLM can only guess at).

Escalate Flash → Pro for the synthesis step when ANY of:
- Stockfish eval delta (best vs second-best line) < 30 centipawns AND ≥ 3 candidate moves are within 50cp → sharp/critical position
- Absolute eval swing from prior position to current > 150 centipawns → tactical moment
- User message matches `/why|explain|plan|endgame|fortress|zugzwang|strategy/i`
- Step count in this turn > 4 (loop has dragged; smarter brain may close it)

Escalate Pro → Deep Think *only* asynchronously (out-of-band) when:
- Pro response contradicts Stockfish's best move (telemetry-detected disagreement), OR
- User explicitly requests "deepest analysis" / "is this winning?" on a non-trivial endgame.

**Temperature: always 1.0.** Gemini 3's reasoning is tuned for 1.0; lowering causes loops and degraded tool selection. Counter-intuitive vs. GPT-era convention; non-negotiable on this provider.

**Persist `thoughtSignature` across turns.** Gemini 3 enforces this on function calls; missing signatures return HTTP 400. AI SDK v6 preserves them as long as we pass full message history back unmodified and don't strip assistant message parts in any custom message massaging.

### 4.3 Context strategy

- **Send full message history every turn.** Gemini's implicit context caching gives ~90% discount on repeated prefixes; structured properly there's no economic benefit to truncation in v0.
- **Stable prefix structure:** every request begins with the same byte-exact system prompt + tool declaration block. Implicit caching kicks in automatically after the first call.
- **Explicit caching** (`cachedContents/{id}`, 1h TTL) for the system prompt + tool declarations once they exceed 32K tokens or implicit cache hits prove insufficient in telemetry. Until then, implicit caching alone is enough.
- **File API for screenshots:** when a user pastes an image, upload via Gemini File API once, reference the URI across `parseScreenshot` and all downstream turns about that position. Avoids re-uploading base64 bytes (which would defeat caching).
- **`prepareStep` strips prior image bytes after the parse step.** Once `parseScreenshot` has returned a FEN, subsequent steps don't need the screenshot in the model's context — only the FEN. `prepareStep` rewrites prior tool-result parts to replace `{ image_bytes }` with `{ fen, sideToMove }`. Single biggest token-cost lever in the system.
- **Tool result shaping:** every tool's `toModelOutput` returns a compact text representation (FEN string, single eval, top-3 PV lines) — never the full UI payload. The rich UI parts live in client state for rendering; the model sees text.
- **`prepareStep` also restricts `activeTools` between steps.** After `parseScreenshot` succeeds, the model only sees `{analyzePosition, showBoard, showOptions, editPosition}` — `parseScreenshot` is removed from the active set so the model can't loop on re-parsing. After `analyzePosition`, restrict further as appropriate.
- **Memory:** v0 has no long-term memory beyond message history. v1+ may add Letta/Mem0 as a memory layer; the integration point is a single `loadHistory()` wrapper that the agent endpoint calls. No part of the tool surface changes when memory lands.

### 4.4 System prompt structure

Per industry consensus and Gemini-specific guidance, the prompt is delineated by markdown headers (or XML tags) into eight sections, in this order:

1. **Identity & role** — 3 lines max. "You are a chess coach. Conversational, mobile-first, never condescending. Helpful > friendly > sycophantic."
2. **Hard rules** — non-negotiable constraints. Examples: "NEVER evaluate a move's quality without calling `analyzePosition` first. NEVER invent a FEN. NEVER claim a position is winning without engine evidence."
3. **Tool guidance** — for each tool: trigger conditions and dependency order, not just capability. `parseScreenshot` before `analyzePosition`; `analyzePosition` before any move-quality claim; `showOptions` only when offering 2-5 discrete choices.
4. **Workflow / decision policy** — the per-turn loop ("if user paste an image: parse → confirm if low confidence via `editPosition` → analyze → respond"). Includes the agent's coaching repertoire: direct answer / single hint / Socratic ladder / candidate-move drill / motif spotting / principle-first / adversarial defense / calculation drill / plan articulation / layered analysis / show-don't-tell. The agent picks contextually.
5. **Output contract** — mobile chat constraints: short paragraphs, board diagrams over descriptions, never walls of text, suggestions emitted via the suggestion adapter not inline prose, user question goes at end of prompt (Gemini 3 prefers).
6. **Tone & UX** — friendly + direct; corrections respect the user; praise is earned and specific; never sycophantic agreement on bad moves.
7. **Recovery / fallbacks** — what to do on ambiguous screenshots (call `editPosition`), engine timeouts (acknowledge + offer retry), off-topic asks (politely redirect), 2 failed parse attempts in one turn (give up, ask user to type FEN).
8. **Examples** — 1-3 short worked turns covering the canonical paths. Examples carry more steering weight than rules.

**Do NOT include in the prompt:**
- Chain-of-thought scaffolding ("think step by step", "first analyze then..."). Gemini 3 already does this via `thinkingLevel`; explicit CoT instructions cause over-thinking.
- Verbose role-playing ("you are an expert grandmaster with decades of...").
- Generic "be helpful, be concise" boilerplate — Gemini 3 defaults already cover this.

The full prompt text is an implementation detail; this spec fixes its shape, ordering, and responsibilities. The prompt is treated as code: stored in source, versioned, evolved via the eval loop in Section 8.

### 4.5 Tool design conventions

Every tool follows the same template, derived from cross-provider best practices:

**Naming:** `verbNoun` in camelCase (e.g., `parseScreenshot`). One atomic action per tool. Names sharply distinct — `showBoard` and `showOptions` can never be confused as siblings.

**Description structure:**
1. Opens with a verb describing the action.
2. Explicit trigger condition: `"Call this when <X>."`
3. Explicit negative example: `"Do NOT call this when <Y>."`
4. One concrete usage example.

Example for `parseScreenshot`:
> Extract a chess position from an image attachment and return FEN. Call this when the user's latest message includes an image attachment AND the image plausibly contains a chess board with pieces on it. Do NOT call this for: chess diagrams the user already gave as FEN text, images of players/events, or pure piece-style references. Example: user uploads a phone screenshot of a Chess.com game and asks "what should I play?"

**Schemas:**
- Strict Zod schemas with `.strict()`. Every parameter has a `.describe(...)` that includes format examples ("FEN string, e.g., 'rnbqkbnr/...'").
- Use `z.enum([...])` aggressively over `z.string()`. Each free-string parameter is a hallucination vector.
- Minimum required parameters; mark everything optional that can be defaulted.

**Response shapes:**
- Every tool returns `{ ok: boolean, ... }`.
- On success: structured data, plus optional `next_steps_hint` field.
- On failure: `{ ok: false, reason: string, suggestion: string }` — never a stack trace. The model reads this and decides recovery (e.g., on `parseScreenshot` low-confidence: call `editPosition`).
- All tool `execute` functions wrap their body in try/catch and convert thrown errors into `{ ok: false, ... }` results. Throwing leaks to the framework as a `tool-error` part and the model often retries forever.

**`toModelOutput`:** every server-execute tool defines a `toModelOutput` that returns a terse, text-only or small-JSON view of the result. The model never sees full image bytes, full engine info-stream output, or full UI payloads. The UI gets the rich version through the original result; the model gets the compact one.

### 4.6 Telemetry

Every `streamText`/`ToolLoopAgent` invocation enables `experimental_telemetry: { isEnabled: true, functionId: 'chess-chat', metadata: { posthog_distinct_id, posthog_trace_id, turn_id } }`. The PostHog OTel processor exports spans surfacing:

- Tokens (in, out, cached, thinking) per call
- Latency (TTFT, total) per step and per turn
- Cost per call
- Tool call name, duration, success/error per step
- Cache hit rate via Gemini's `cachedContentTokenCount`
- Model used per step (Flash vs Pro) — confirms `prepareStep` is escalating correctly

Plus explicit application-level events emitted alongside the SDK telemetry:

- `coaching.engine_disagreement` — Flash's praise-worthy move ≠ Stockfish's top move. Alert threshold 5%.
- `coaching.latency_overspend` — Pro escalation when eval delta was actually <30cp. Indicates over-eager heuristic.
- `routing.thinking_waste` — thinking tokens >5000 on a tool-routing step (should be <1000 with `thinkingLevel: 'low'`).
- `vision.invalid_fen` — `parseScreenshot` output fails chessops legality check.
- `tool.dead_loop` — same tool called >2× in one turn with identical args.
- `interactive.abandoned` — `showOptions` or `editPosition` rendered but never resolved before chat closed.

These are the dashboards we look at to tune the system prompt and `prepareStep` heuristics during the eval loop.


---

## 5. Frontend

### 5.1 Information architecture

The PWA is single-route: `/`. There is no navigation in the traditional sense.

- **Chat surface** occupies the full viewport. Composer is fixed at the bottom respecting safe-area-inset-bottom.
- **Chat list** lives in a vaul bottom Drawer with snap points (`['20%', '60%', 1]`), opened by a button in the top-left of the chat shell. The peek snap shows the most recent chats with a board thumbnail. The full snap exposes an overflow menu at the bottom with the few v0 utility actions: "Export all chats", "Clear all data", "About". No separate Settings surface — v0 doesn't have settings worth their own panel.
- **Image preview** (tap the pasted screenshot) opens a shadcn `Dialog` with pinch-zoom — not a Drawer (Drawers near full-height have iOS quirks).
- **`editPosition` interactive tool** uses a full-snap vaul Drawer (transient, dismissed once the user confirms).

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
    consumeStream: true,  // ensures DB write even if PWA disconnects mid-stream
    generateMessageId: () => crypto.randomUUID(),
    onFinish: ({ messages: final }) => persistFinalMessages(id, final),
  });
}
```

`chessAgent` is a module-scope `ToolLoopAgent` (constructed once at module load, never per-request) with `tools`, `instructions` (system prompt), `stopWhen: [stepCountIs(8), hasToolCall('showOptions'), hasToolCall('editPosition')]`, and a default model. `prepareStep` handles three things: model swap (Flash → Pro on heuristics), active-tool restriction (removes `parseScreenshot` after it has succeeded once in the turn), and prior-image stripping (replaces image bytes with FEN text after parse step). `consumeStream: true` guarantees `onFinish` runs even if the user backgrounds the app mid-stream — critical for mobile PWA persistence.

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

### 8.3 Eval approach (lightweight, error-analysis-driven)

Agent quality cannot be designed up front — it must be measured against real traces and iterated. The eval approach is sized for solo-dev v0:

1. **Log everything from day one.** Every turn writes: input messages, system prompt version, tool calls, tool inputs, tool outputs, model choice per step, final response, telemetry events. Stored in PostHog LLM Analytics (via OTel) and a local JSONL file in development.
2. **Don't write evals upfront for hypothetical failures.** Use the system, capture 20-50 real traces, then open-code the actual failure modes. Pre-imagined evals over-fit to assumptions.
3. **Golden set in repo.** `golden-set/` directory contains 20-30 hand-curated turns covering: clean Chess.com screenshots, blurry/cropped screenshots, ambiguous positions, user-supplied FEN, off-topic questions, sycophancy traps (user proposes a blunder), endgame scenarios. Grows organically from real failures.
4. **Binary assertions first** (Python or TypeScript), not LLM-as-judge. Examples: "did `analyzePosition` get called before any move-quality claim?" "did the final FEN parse as legal?" "did the model agree with a user-proposed blunder?" Binary checks are deterministic, debuggable, and surface real regressions.
5. **LLM-as-judge later** for fuzzy criteria (tone, pedagogical helpfulness) — only after binary metrics are stable.
6. **Run the eval on every prompt or tool change.** Quick command runs the golden set; pre-commit hook (or manual) before pushing prompt changes. Fast enough that it never gets skipped.
7. **One feedback button in the UI.** Thumbs-down + free-text on any assistant message. That's the inbox; triage weekly. Real-user fails feed the golden set.

The eval loop is what tunes the system prompt and the `prepareStep` heuristics over time. The spec fixes the *shape* of the agent; the eval loop fixes its *quality*.

---

## 9. Build sequence (high-level)

Detailed implementation plan comes next via the writing-plans skill. This is the build order so the plan can structure itself. The order is optimized so that **a tappable PWA on the developer's phone exists at step 1**, and every subsequent step adds visible, testable behavior — not "build a backend for a week then plug in a UI."

1. **Deployed PWA skeleton + code-quality baseline (Day 1).** Next.js + TS (strict mode) + Tailwind v4 + shadcn/ui + Vercel deployment. Manifest, viewport meta, safe-area styling, theme color. Static landing screen with the app title. A2HS-installable on iOS. **Tooling wired in this same step** (per Appendix C.4): `tsconfig.json` strict flags, ESLint with footgun rules, Prettier, husky + lint-staged pre-commit, CI workflow running type-check + lint + format on every push. **Preview URL → phone home screen the same hour the project starts.**
2. **Chat shell with mock data.** assistant-ui mounted, hardcoded fake conversation rendered including a faked board, faked options chips, a faked editPosition drawer. No backend, no AI. The phone-installed app now *feels* like the product — every layout, gesture, safe-area issue surfaces immediately.
3. **Board renderer integration.** Thin React wrapper around chessground; cburnett piece assets; chessops integration helpers (`chessgroundDests`, `parseFen`, etc.). Replace the faked board in mock data with a real chessground rendering of a hardcoded FEN. Phone-test touch quality.
4. **Persistence layer.** Dexie schema, `ChatRepository` interface + Dexie adapter, streaming-write coalescer, `useLiveQuery` wiring. Replace mock conversations with real Dexie-backed ones (still hardcoded message content — no AI yet). Multi-thread runtime adapter for assistant-ui wired up so the chat-list Drawer shows real chats.
5. **Stockfish backend.** Warm singleton in module scope, `analyzePosition(fen, opts)` server function exposed via a minimal test endpoint. Hit it from a debug page with hardcoded FENs; confirm depth/time/MultiPV behavior. Not yet wired to the agent.
6. **Agent shell, first turn end-to-end.** `/api/chat` with `ToolLoopAgent`, all five tools defined and wired to real implementations (server tools to real services; render-only tools to assistant-ui registrations from step 2). System prompt v1 following the 8-section template. AI Gateway + `@ai-sdk/google` for Gemini. `prepareStep` with the model-routing heuristics. **Real conversation now works on phone preview URL.**
7. **Composer + paste UX.** Paste-from-clipboard handler, `SimpleImageAttachmentAdapter`, drop zone for desktop, file picker fallback. Forced `mode: 'ANY'` for `parseScreenshot` when an image attachment is present.
8. **PWA polish.** `@serwist/next` service worker, A2HS banner with iOS-specific instructions, `visualViewport`-based keyboard handling, persistent-storage request after first user message.
9. **Resumable streams.** Upstash Redis store, `useChat({ resume: true })`, `consumeStream: true` on the response. Phone-test backgrounding mid-analysis.
10. **Suggestions adapter.** Generates 3-4 follow-up chips after each agent response via a small Gemini Flash call.
11. **Observability + first eval loop.** PostHog client init (autocapture, replay, errors). `instrumentation.ts` with `PostHogSpanProcessor`. Application-level event emission (engine_disagreement, latency_overspend, etc.). Begin logging real turns. Start a `golden-set/` directory in the repo and capture 5-10 real traces per usage session.
12. **Mobile UI polish.** sonner toasts, vaul chat-list Drawer with snap points + overflow menu (export, clear), image preview Dialog, `editPosition` Drawer refinement, BotID Basic on `/api/chat`.
13. **System prompt + heuristic iteration.** Using PostHog telemetry + session replays + golden set: tune the system prompt section by section, tighten `prepareStep` escalation heuristics, refine tool descriptions where the model misbehaves. This step never really "completes" — it's the ongoing eval loop.

After step 2, every step lands on the developer's phone via Vercel preview URLs (Deployment Protection keeps them private). The cycle is: code → push → preview URL → install on phone via QR code → tap.

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

## Appendix A — Failure-mode register

The five failure modes our chess agent is most likely to hit, and the prevention strategy for each. Telemetry events (Section 4.6) detect occurrences; system-prompt rules (Section 4.4) prevent them.

1. **Vision-parse cascade.** Bad FEN from `parseScreenshot` silently corrupts all downstream analysis and coaching. The model confidently coaches a position that doesn't exist.
   *Prevention:* `parseScreenshot` returns a confidence score and per-square confidences. System prompt rule: "If confidence < 0.9 on key squares, call `editPosition` to confirm." Chessops validates legality; illegal positions retry once with error feedback, then escalate to `editPosition`.
   *Detection:* `vision.invalid_fen` event.

2. **Premature termination / over-eagerness.** Model answers "looks fine, play Nf3" without calling `analyzePosition`. Mobile chat encourages short replies — this temptation is real.
   *Prevention:* hard rule in system prompt: "NEVER assess a move's quality, claim a position is winning, or suggest a specific move without calling `analyzePosition` first." `prepareStep` could detect a final response mentioning a specific move SAN with no `analyzePosition` result in the turn and force a retry, but probably overkill — the rule + eval loop should catch it.
   *Detection:* `coaching.engine_disagreement` event (move claimed good ≠ Stockfish's best).

3. **Infinite re-parse loops.** Model calls `parseScreenshot` → low confidence → calls `editPosition` → user corrects → re-parses → still ambiguous → tries again.
   *Prevention:* per-turn tool budget: max 2 `parseScreenshot` calls in one turn. After 2 failures, system prompt falls back to "ask the user to type the FEN directly." Step budget `stepCountIs(8)` is the hard backstop.
   *Detection:* `tool.dead_loop` event (any tool called >2× with identical args in one turn).

4. **Wrong-tool selection between `showBoard` and `showOptions`.** Similar surfaces; both "display something." Model uses `showBoard` when it should be offering choices, or vice versa.
   *Prevention:* sharply distinct names + descriptions with explicit "Use ONLY when..." clauses. `showBoard`: "Use when the user benefits from seeing a position visually." `showOptions`: "Use ONLY when offering 2-5 discrete next actions for the user to choose between." Plus enum-typed tool parameters where applicable.
   *Detection:* eval-loop manual review (binary assertions can't easily catch this).

5. **Sycophantic agreement on bad moves.** User says "I think Nxh7 is winning" → model agrees without engine check.
   *Prevention:* same hard rule as failure mode #2 ("NEVER assess a move without `analyzePosition`"). Plus tone rule in Section 4 of the system prompt: "Disagreement is helpful; sycophancy is harmful. If `analyzePosition` shows the user's move is bad, say so directly and explain why."
   *Detection:* `coaching.engine_disagreement` event, specifically when the disagreement *is with a user-proposed move* — a higher-severity variant worth alerting.

## Appendix B — Product/architecture checklist (for code review)

When implementing, every PR should pass these:

- [ ] Is there an existing library that does this? Did we consider it before writing custom code?
- [ ] Is this conversation logic? If yes, is it in the system prompt, not in React?
- [ ] Does this work on iOS Safari in standalone PWA mode? Tested on the preview URL?
- [ ] If the agent emits text, would a board or a button render the information better?
- [ ] If we're sending bytes to Gemini, is the prefix still cache-friendly?
- [ ] If we're writing to Dexie during a stream, are we coalescing?
- [ ] If we're adding a tool, is it registered at app root for replay correctness?
- [ ] If we're adding a vendor, what does it give us for free that we're not yet using?

## Appendix C — Code-quality and type-driven development

These principles apply to every line of code in the project. They are enforced by tooling wherever possible (Appendix C.4), so the principles below describe the *intent* — the tooling enforces the rest.

### C.1 The five qualities

Every piece of code should be:

1. **Minimal** — every line is a tax. New code must justify its existence. Default to subtraction.
2. **Clear** — obvious to a reader six months from now without context. Identifiers are documentation. No cleverness, no implicit magic.
3. **Maintainable** — change is cheap. Refactoring is safe. The next person can touch the code without fear.
4. **Extensible at well-chosen seams** — interfaces, repositories, tool contracts where future change is real. *Never* plugin systems or configurability for hypothetical futures.
5. **Testable** — pure functions, narrow inputs, explicit dependencies. Testability is a proxy for good design; hard-to-test code is hard-to-change code.

### C.2 Shift-left

Catch defects as far left in the SDLC as possible, using checks that are **deterministic, fast, and machine-enforced**:

- TypeScript strict — compile-time errors are free
- Zod validation at every untyped boundary — runtime errors caught at the edge, not deep inside
- ESLint with footgun rules — at edit time
- Prettier auto-format — never debate style
- Pre-commit hooks — fast path on changed files only
- CI — full path on every push

**Determinism beats heuristics.** If TypeScript can catch it, don't write a test for it. If a Zod schema can validate it, don't trust the caller. If a linter rule can enforce it, don't rely on code review or memory. Move every check to the cheapest, most reliable tier that can perform it.

### C.3 Type-driven development

Push as much as we can into the type system. Keep types themselves clear.

**Principles:**
- Sketch types first; write code that satisfies them. Compiler is a design tool.
- Make illegal states unrepresentable *where the illegal state is a real risk*. Not as a religious exercise.
- **Zod schemas as the single source of truth** for boundary types. `z.infer<typeof schema>` derives TS types from runtime validators. Never maintain duplicate runtime validators and TS types.
- **Lean on library-provided types:** AI SDK's `InferAgentUIMessage<typeof agent>`, `tool()` schema inference, chessops's `Position` / `Move` / `Square` / `Piece`, Dexie's `EntityTable<T>`. Don't redefine what we get.
- **Discriminated unions for fallible results:** `{ ok: true; data: T } | { ok: false; reason: string; suggestion?: string }`. Compiler forces both branches at every call site.
- **Branded types only where confusion is real.** Likely `ChatId`, `MessageId`, possibly `Fen`. Not for everything that happens to be a string.

**Anti-spaghetti:**
- **Climb the complexity ladder slowly.** Type/interface → union → discriminated union → generic with 1 param → generic with 2 params → generic with constraints. Stop as soon as the invariant is captured.
- **No type-level computation** — no recursive conditional types, parser combinators in the type system, or template-literal type magic beyond what standard utility types provide. If TypeScript's standard repertoire can't express it cleanly, the invariant belongs at runtime.
- **No deep generic chains.** A generic with more than 2 type parameters is almost always wrong.
- **If a type needs a comment to understand, simplify it first.** Failing that, one short `why` line — never explain *what* the type is.
- **Compiler errors must read like English problems**, not compiler internals. If you find yourself debugging type errors that span 100+ lines, the type is too clever.
- **Function overloads only when input-output relationships genuinely can't be a discriminated union.**

### C.4 Tooling baseline (wired in build step 1)

**`tsconfig.json`:**
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `noImplicitOverride: true`
- `noFallthroughCasesInSwitch: true`
- `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`

**ESLint config:**
- `@typescript-eslint/recommended-type-checked` + `@typescript-eslint/stylistic-type-checked`
- Footgun rules promoted to `error`:
  - `@typescript-eslint/no-explicit-any`
  - `@typescript-eslint/no-floating-promises`
  - `@typescript-eslint/no-misused-promises`
  - `@typescript-eslint/no-non-null-assertion`
  - `react-hooks/exhaustive-deps`
- No `// eslint-disable-*` without an inline comment explaining *why*

**Prettier:** default config; auto-format on save (editor) and pre-commit (lint-staged).

**Pre-commit hook (husky + lint-staged):** on changed files only — `tsc --noEmit` (project-wide for correctness), ESLint `--fix`, Prettier. Target: under 5 seconds for typical edits, so it never gets skipped.

**CI on every push:**
- `tsc --noEmit` (full project)
- `eslint .`
- `prettier --check .`
- `next build` verifies
- Golden-set eval (once it exists — Section 8.3)

Pre-commit and CI together: nothing reaches `main` without strict types, zero lint errors, and a clean build.

### C.5 Style conventions

- **Plain functions over classes** by default. Classes only when state + behavior are genuinely coupled (rare in this codebase).
- **Co-locate helpers with their first caller.** Promote to a shared module on the *second* use case, not the first.
- **No `utils/` or `helpers/` dumping grounds.** Helpers live in named domain modules (`lib/chess/`, `lib/persistence/`, `lib/agent/`).
- **Names follow intent, not implementation.** `getChatById` over `findChatRow`; `analyzePosition` over `runEngineWasm`.
- **One module = one concern.** A file approaching ~300 lines is a signal the module boundary is wrong, not a signal to split arbitrarily.
- **Comments explain *why*, never *what*.** The code shows what.

### C.6 What we won't do

- Plugin systems, registries for hypothetical extensions, configurable behavior for behaviors we don't yet have.
- Feature flags without a documented retirement date.
- Tests for trivial code (simple getters, pass-through transforms).
- Snapshot tests for output that isn't strictly stable.
- Code or abstractions added "in case we ever need to..." — wait for the *second* concrete use case before abstracting.
- `any` or `@ts-ignore` without an inline justification comment.
- "Helper" wrappers around standard library functions that don't add behavior.
- Premature performance optimization. Optimize *after* measurement, never before.
- Mocking what we own. If a module is hard to use real in tests, fix the module, not the test.
