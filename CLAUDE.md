# Chess Screenshot Analyzer — Project Context

A Progressive Web App for iOS Safari: paste a chess screenshot, get coached by an AI agent that has a real chess engine. Personal project (developer: Mark Watson / Vidably), architected so any later feature is additive.

## Key documents

- **Design spec:** `docs/superpowers/specs/2026-05-16-chess-screenshot-analyzer-design.md` — comprehensive, authoritative source of architecture, principles, tool palette, stack, and conventions. Read this first.
- **Implementation plans:** `docs/superpowers/plans/*.md` — one plan per vertical slice (see below).
- **Git history:** decisions are captured in commits; spec lives in git.

## How we work

**Vertical thin slices, not horizontal layers.** Each plan delivers an end-to-end user-visible capability (UI + backend + persistence as needed) — not "all the foundation, then all the agent." Each slice is shippable to a Vercel preview URL on its own.

11 plans total: Plan 0 sets up the rails; Plans 1-10 are vertical product slices (see Section 10 of the spec).

0. Repo & deploy pipeline (rails, not a product slice)
1. Static board + engine call (no AI, no vision, no chat)
2. Vision parse (paste image → FEN)
3. One-turn coach chat
4. Multi-turn + Dexie persistence
5. Multi-chat list
6. Interactive tools (showOptions, editPosition)
7. PWA finalize
8. Resumable streams + observability
9. Suggestions + mobile polish
10. Eval loop iteration (ongoing)

Plans are written one at a time, in order.

## Standing principles (full versions in spec Section 1.1 + Appendix C)

1. **Lean on trusted libraries and vendors.** Custom code requires justification; subtraction is the default.
2. **Mobile is a first-class constraint.** iOS Safari, thumb reach, safe areas, paste workflow.
3. **Highest-bandwidth medium wins.** Boards with arrows over prose; buttons over typing.
4. **The agent owns conversation flow.** No hardcoded confirmations or mode buttons in React; the agent decides.
5. **Helpful > friendly > sycophantic.** Coaching corrects you because it respects you.
6. **World-class UI/UX via library selection,** not bespoke design.
7. **Use every cheap/free vendor feature on the table** (implicit caching, telemetry, replay, etc.).
8. **Five code qualities:** minimal, clear, maintainable, extensible at well-chosen seams, testable.
9. **Shift-left:** TypeScript strict, Zod at boundaries, ESLint, Prettier, husky, CI. Determinism beats heuristics.
10. **Type-driven development with anti-spaghetti guardrails.** Push invariants into types; keep types themselves clear. Climb the complexity ladder slowly.

## Stack (locked in)

Next.js App Router + TS + Tailwind v4 + shadcn/ui on Vercel · Gemini 3 via `@ai-sdk/google` through Vercel AI Gateway · AI SDK v6 `ToolLoopAgent` + assistant-ui · Stockfish 17.1 WASM (server-side, warm singleton) · chessground + chessops · Dexie v4 · vaul + sonner · `@serwist/next` · PostHog (LLM Analytics + Replay + Errors) · Upstash Redis for resumable streams only.

## Behavioral preferences

- **Restate decisions before locking them in.** When the user introduces a new principle or constraint, paraphrase it back (the *why*, not just the *what*) before continuing. This was the pattern across the entire spec brainstorm.
- **Propose 2-3 options for non-trivial decisions** with tradeoffs, then recommend one. Don't ask 1-by-1 when a structured comparison would be more useful.
- **Lean on parallel subagents for research-heavy work.** When the user asks for thorough investigation across multiple tools/domains, dispatch parallel general-purpose subagents and synthesize.

## Vendor account scoping

Mostly-personal pattern (true separation), with Google AI and PostHog on Vidably for path-of-least-resistance:

- **GitHub:** Personal (public repo per GPL).
- **Vercel:** Personal Hobby tier (free, has every feature we need).
- **Upstash Redis:** Personal free tier (resumable-stream store only).
- **Google AI / GCP:** Vidably (separate project + API key).
- **PostHog:** New project inside the existing Vidably PostHog org.

See spec Section 3.1 for the full rationale.
