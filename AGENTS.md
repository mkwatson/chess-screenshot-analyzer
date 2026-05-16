<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

## ⚠️ Hard rule: nothing sensitive in this repo, ever

The repository is **public on GitHub**. Treat every byte as eventually-Google-able and permanent in git history.

**Never commit:** API keys, tokens, credentials, OAuth secrets, production user data, personal emails or phone numbers beyond what's already on Mark's public profile, internal endpoint URLs, debug hosts, or anything from `.env.local` by any path.

**Even commit messages and PR descriptions are public.** Don't paste a real value "just to share."

Three enforcement layers are wired:
1. `gitleaks` pre-commit hook (catches secrets locally before any commit).
2. `gitleaks` GitHub Actions workflow (catches anything that bypassed the local hook).
3. GitHub native secret scanning + push protection (server-side block by provider signatures).

If gitleaks fires on a false positive, edit `.gitleaks.toml`'s `[allowlist]` to permit that specific path or pattern — **never** weaken the rules globally.

If a real secret is ever pushed: **rotate it immediately**, then ask Mark before doing anything to git history (force-push-history rewrites are dangerous).

---

# Chess Screenshot Analyzer

A Progressive Web App for iOS Safari that analyzes chess positions from screenshots. Paste a board → get coached by an AI agent with a real chess engine. Personal project (Mark Watson / Vidably), architected so any later feature is additive.

## Key documents

- **Design spec** (authoritative): `docs/superpowers/specs/2026-05-16-chess-screenshot-analyzer-design.md`
- **Implementation plans**: `docs/superpowers/plans/*.md` — one plan per vertical slice
- **Git history**: decisions are captured in commits; the spec lives in git

When in doubt, the spec wins. This file summarizes; the spec is the source of truth.

## How we work

**Vertical thin slices, not horizontal layers.** Each plan delivers an end-to-end user-visible capability (UI + backend + persistence as needed). Each slice is shippable to a Vercel preview URL on its own.

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
6. **World-class UI/UX via library selection**, not bespoke design.
7. **Use every cheap/free vendor feature on the table** (implicit caching, telemetry, replay, etc.).
8. **Five code qualities:** minimal, clear, maintainable, extensible at well-chosen seams, testable.
9. **Shift-left.** For every check, pick the cheapest deterministic mechanism upstream. Hierarchy: types → lint → DB constraints → build-time checks → deterministic CI → preview deploys → tests we maintain.
10. **Type-driven development with anti-spaghetti guardrails.** Push invariants into types; keep types themselves clear. Climb the complexity ladder slowly.
11. **Tests are not exempt from minimum-complexity discipline.** Don't write tests for the sake of coverage. Few, complementary, valuable. If a type, lint rule, DB constraint, or preview deploy already proves something, a test that re-asserts the same guarantee is duplication — extra source to maintain, drifts from reality, adds CI latency.
12. **Compound engineering.** When the user teaches a rule, build the prevention into artifacts (AGENTS.md, lint, hooks, reviewer prompts) so it applies automatically going forward — don't rely on memory.
13. **Keep going.** Don't stall on ceremony. Make forward progress.

## Stack (locked in)

Next.js App Router + TS + Tailwind v4 + shadcn/ui on Vercel · Gemini 3 via `@ai-sdk/google` (direct; AI Gateway deferred — see spec Section 3 / CLAUDE.md follow-ups) · AI SDK v6 `ToolLoopAgent` + assistant-ui · Stockfish 17.1 WASM (server-side, warm singleton) · chessground + chessops · Dexie v4 · vaul + sonner · `@serwist/next` · PostHog (LLM Analytics + Replay + Errors) · Upstash Redis for resumable streams only.

## Vendor account scoping

Mostly-personal pattern (true separation), with Google AI and PostHog on Vidably for path-of-least-resistance:

- **GitHub:** Personal (public repo per GPL-3.0 obligations from chess libraries).
- **Vercel:** Personal Hobby tier (free; has every feature we need).
- **Upstash Redis:** Personal free tier (resumable-stream store only).
- **Google AI / GCP:** Vidably (separate project + API key).
- **PostHog:** New project inside the existing Vidably PostHog org.

See spec Section 3.1 for the full rationale.

## Local development

```bash
pnpm install
cp .env.example .env.local  # fill in values as plans introduce them
pnpm dev                    # http://localhost:3000
```

## Commands

```bash
pnpm dev           # Next.js dev server (Turbopack)
pnpm build         # Production build
pnpm start         # Run production build locally
pnpm typecheck     # tsc --noEmit
pnpm lint          # ESLint
pnpm format        # Prettier write
pnpm format:check  # Prettier check (used in CI)
```

## Coding conventions

- **TypeScript strict** with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`. No `any`. No `@ts-ignore` without an inline justification.
- **Zod schemas as the single source of truth** for boundary types — `z.infer<typeof schema>` derives TS types from runtime validators. Never maintain duplicates.
- **Discriminated `{ ok: true; data } | { ok: false; reason }`** for fallible operations.
- **Branded IDs** only where confusion is real (`ChatId`, `MessageId`, `Fen`).
- **Plain functions over classes** by default. Classes only when state + behavior are genuinely coupled.
- **Co-locate helpers with their first caller.** Promote to a shared module on the *second* use case.
- **No `utils/` or `helpers/` dumping grounds.** Helpers live in named domain modules.
- **Comments explain *why*, never *what*.**

See spec Appendix C for the full code-quality and type-driven-development appendix.

## PR and commit conventions

- Short, imperative subject. `chore:`, `feat:`, `fix:`, `docs:`, `ci:`, `test:` prefixes.
- For multi-line commits, the body explains *why*. The diff shows *what*.
- All AI-coding-agent commits include a `Co-Authored-By:` trailer (whatever model is doing the work).
- Pre-commit hook (husky + lint-staged) runs ESLint --fix + Prettier on changed files. Don't bypass it.
- CI gates merges on type-check + lint + format check + build. Don't merge red.

## What lives where

- `app/` — Next.js App Router pages, layouts, route handlers
- `components/` — React components (shadcn primitives + project components)
- `lib/` — domain modules (`lib/agent/`, `lib/chess/`, `lib/persistence/`, `lib/engine/`, etc.)
- `public/` — static assets, PWA icons, manifest
- `docs/superpowers/` — specs, plans, and other long-lived design docs
- `.github/workflows/` — CI

A file approaching ~300 lines is a signal the module boundary is wrong, not a signal to split arbitrarily.
