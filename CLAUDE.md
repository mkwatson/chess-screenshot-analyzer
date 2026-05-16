@AGENTS.md

## Claude Code specifics

The bulk of project context lives in `AGENTS.md` (shared across all AI coding agents). Items below are Claude-Code-specific.

### Current execution state

- **Plan 0 (rails) — SHIPPED.** Production live at `https://chess-screenshot-analyzer-n3510j4lc-mark-6951s-projects.vercel.app` (and any future deployment URLs). PWA installed on Mark's iPhone. Three-layer secret-leak protection active (gitleaks pre-commit + CI + GitHub native scanning). CI gates merges on type-check + lint + format + build + gitleaks.
- **Next plan:** Slice 1 — Static board + engine call. Plan document not yet written; the writing-plans skill produces it from spec Section 10.
- **Latest commit:** see `git log -1`.

### Known follow-ups (small, deferred)

- **Node 20 deprecation in GitHub Actions** (`actions/checkout@v4`, `pnpm/action-setup@v4`, etc. still on Node 20). GitHub flips default to Node 24 on **2026-06-02**; actions are expected to ship Node 24 builds by then. Re-check workflow runs after that date.
- **Next.js 16 `pnpm build` rewrites `tsconfig.json`** (sets `jsx: react-jsx`, adds `.next/dev/types/**/*.ts`). Each rebuild produces a dirty git state until reverted. Investigate when it starts causing friction.
- **shadcn CLI in `dependencies`** instead of `devDependencies` (shadcn's default install does this). Minor production-bundle bloat; cleanup if it becomes annoying.
- **`bun`'s `vercel` shim at `/Users/mark/.bun/bin/vercel` shadows the pnpm-global newer Vercel CLI** on PATH. Clean up by `rm`'ing the bun shim or reordering PATH.
- **GitHub non-provider secret-pattern scanning** not enabled (toggle not visible on Hobby public repos; likely requires GHAS).

### Behavioral preferences

- **Restate decisions before locking them in.** When the user introduces a new principle or constraint, paraphrase it back (the *why*, not just the *what*) before continuing. This was the pattern across the entire spec brainstorm.
- **Propose 2-3 options for non-trivial decisions** with tradeoffs, then recommend one. Don't ask one-by-one when a structured comparison would be more useful.
- **Lean on parallel subagents for research-heavy work.** When the user asks for thorough investigation across multiple tools or domains, dispatch parallel general-purpose subagents and synthesize.

### Workflow skills

The `superpowers:*` skills (`brainstorming`, `writing-plans`, `subagent-driven-development`, `executing-plans`) drive the plan-based workflow. Spec lives in `docs/superpowers/specs/`; plans in `docs/superpowers/plans/`.
