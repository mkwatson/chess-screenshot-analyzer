@AGENTS.md

## Claude Code specifics

The bulk of project context lives in `AGENTS.md` (shared across all AI coding agents). Items below are Claude-Code-specific.

### Current execution state

- **Plan 0 (rails) — SHIPPED.** Production live, CI gates merges, three-layer secret-leak protection active (gitleaks pre-commit + CI + GitHub native scanning).
- **Plan 1 (static board + engine call) — SHIPPED.** Production has a starting-position board and an Analyze button that POSTs to `/api/analyze`. Server-side `@se-oss/stockfish@1.0.1` (Stockfish 17.1 WASM) runs as a module-scope warm singleton at depth 14 and returns the best move; the board paints it as a green arrow. Vitest 4 wired with `// @vitest-environment jsdom` pragma for DOM tests.
- **Next plan:** Slice 2 — Vision parse (paste image → FEN). Plan document not yet written.
- **Latest commit:** see `git log -1`.

### Known follow-ups (small, deferred)

- **Node 20 deprecation in GitHub Actions** (`actions/checkout@v4`, `pnpm/action-setup@v4`, etc. still on Node 20). GitHub flips default to Node 24 on **2026-06-02**; actions are expected to ship Node 24 builds by then. Re-check workflow runs after that date.
- **Next.js 16 `pnpm build` rewrites `tsconfig.json`** (sets `jsx: react-jsx`, adds `.next/dev/types/**/*.ts`). Each rebuild produces a dirty git state until reverted. Investigate when it starts causing friction.
- **shadcn CLI in `dependencies`** instead of `devDependencies` (shadcn's default install does this). Minor production-bundle bloat; cleanup if it becomes annoying.
- **`bun`'s `vercel` shim at `/Users/mark/.bun/bin/vercel` shadows the pnpm-global newer Vercel CLI** on PATH. Clean up by `rm`'ing the bun shim or reordering PATH.
- **GitHub non-provider secret-pattern scanning** not enabled (toggle not visible on Hobby public repos; likely requires GHAS).
- **`chessground@9.2.1` is marked deprecated on npm** ("Package no longer supported"). Lichess may have moved to a renamed package (e.g. `@lichess-org/chessground`). API works for now. Investigate before Plan 4+ when we lean on chessground more heavily.
- **Vercel function cold start** for `/api/analyze` is slow (~30s the first time, hitting our `maxDuration: 30` boundary on the very first request after a fresh deploy). Stockfish WASM is 79 MB and traced into the function bundle; first invocation pays the WASM init cost. Warm requests are fast. Worth investigating Fluid Compute prewarming or moving init to the module scope's first await.
- **iOS PWA standalone-mode caching:** without a service worker, the home-screen PWA shows stale content after a deploy. Visiting the same URL fresh in Safari works. **Plan 7 (PWA finalize) MUST address this** via `@serwist/next` with skipWaiting + clientsClaim, ideally with a refresh prompt or auto-reload on new build. Until then: force-quit + relaunch the PWA, or re-install from Safari.

### Behavioral preferences

- **Restate decisions before locking them in.** When the user introduces a new principle or constraint, paraphrase it back (the *why*, not just the *what*) before continuing. This was the pattern across the entire spec brainstorm.
- **Propose 2-3 options for non-trivial decisions** with tradeoffs, then recommend one. Don't ask one-by-one when a structured comparison would be more useful.
- **Lean on parallel subagents for research-heavy work.** When the user asks for thorough investigation across multiple tools or domains, dispatch parallel general-purpose subagents and synthesize.

### Workflow skills

The `superpowers:*` skills (`brainstorming`, `writing-plans`, `subagent-driven-development`, `executing-plans`) drive the plan-based workflow. Spec lives in `docs/superpowers/specs/`; plans in `docs/superpowers/plans/`.
