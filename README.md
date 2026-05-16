# Chess Screenshot Analyzer

A Progressive Web App for iOS Safari that analyzes chess positions from screenshots. Paste a board, get coached by an AI agent with a real chess engine.

**Status:** in active development — Plan 0 (rails) complete.

## Documents

- **Design spec:** [`docs/superpowers/specs/2026-05-16-chess-screenshot-analyzer-design.md`](docs/superpowers/specs/2026-05-16-chess-screenshot-analyzer-design.md)
- **Implementation plans:** [`docs/superpowers/plans/`](docs/superpowers/plans/)
- **AI coding agent context:** [`AGENTS.md`](AGENTS.md) (shared across Codex, Gemini CLI, Aider, Claude Code)
- **Claude Code overlay:** [`CLAUDE.md`](CLAUDE.md)

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

## License

This project depends on GPL-3.0 libraries (chessground, chessops, Stockfish). Source is published per the GPL.
