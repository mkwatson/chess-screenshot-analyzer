@AGENTS.md

## Claude Code specifics

The bulk of project context lives in `AGENTS.md` (shared across all AI coding agents). Items below are Claude-Code-specific.

### Current execution state

- **Active plan:** `docs/superpowers/plans/2026-05-16-repo-and-deploy-pipeline.md` (Plan 0 — Repo & deploy pipeline)
- **Resume point:** Plan 0 Task 5 (Tasks 1-4 complete: Node 24 LTS, gh repo created and pushed, Next.js scaffold, strict tsconfig).
- **Latest commit:** see `git log -1`.

### Behavioral preferences

- **Restate decisions before locking them in.** When the user introduces a new principle or constraint, paraphrase it back (the *why*, not just the *what*) before continuing. This was the pattern across the entire spec brainstorm.
- **Propose 2-3 options for non-trivial decisions** with tradeoffs, then recommend one. Don't ask one-by-one when a structured comparison would be more useful.
- **Lean on parallel subagents for research-heavy work.** When the user asks for thorough investigation across multiple tools or domains, dispatch parallel general-purpose subagents and synthesize.

### Workflow skills

The `superpowers:*` skills (`brainstorming`, `writing-plans`, `subagent-driven-development`, `executing-plans`) drive the plan-based workflow. Spec lives in `docs/superpowers/specs/`; plans in `docs/superpowers/plans/`.
