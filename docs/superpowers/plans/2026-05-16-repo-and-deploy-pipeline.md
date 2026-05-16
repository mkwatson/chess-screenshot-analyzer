# Plan 0 — Repo & Deploy Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the GitHub repo, Vercel auto-deploy pipeline, code-quality tooling baseline, and developer experience so that every subsequent commit auto-deploys to a phone-installable PWA with type-check + lint + format gates enforced.

**Architecture:** Standard Next.js 16 App Router project on Vercel Node runtime (Fluid Compute default). TypeScript strict; ESLint flat config with type-checked rules; Prettier; husky pre-commit; GitHub Actions for CI on every push; eruda mounted only in development for in-page mobile debugging. No product code beyond a blank landing page — slice 1 introduces the first real feature.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.x strict, Tailwind v4, ESLint 9 (flat config), Prettier 3, husky 9, lint-staged 16, pnpm 10, Vercel CLI 54, GitHub Actions, eruda.

---

## Reference docs

- Spec: `docs/superpowers/specs/2026-05-16-chess-screenshot-analyzer-design.md` — especially Sections 1.1 (principles), 3 (stack), 5.6 (PWA setup), Appendix C (code quality + tooling baseline)
- CLAUDE.md at project root — context for future sessions

---

## File structure (what this plan creates or modifies)

**Project root:**
- `package.json` — dependencies, scripts, `engines` field
- `pnpm-lock.yaml` — generated
- `tsconfig.json` — strict mode flags (Appendix C.4)
- `next.config.ts`
- `vercel.ts` — Vercel project config
- `eslint.config.mjs` — flat config, footgun rules as errors
- `.prettierrc.json`
- `.prettierignore`
- `.editorconfig`
- `.nvmrc`
- `.env.example`
- `.gitignore` (extended)
- `README.md`
- `components.json` — shadcn/ui config (init only; no components added)

**Application code:**
- `app/layout.tsx` — root layout with manifest link, viewport meta, theme color, eruda mount
- `app/page.tsx` — placeholder landing screen (Plan 1 replaces)
- `app/globals.css` — Tailwind imports
- `postcss.config.mjs` — Tailwind v4 plugin
- `components/dev-console.tsx` — eruda mount, dev-only

**Public:**
- `public/manifest.webmanifest`
- `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png` — placeholder solid-color PNGs

**Tooling:**
- `.husky/pre-commit` — runs lint-staged
- `.github/workflows/ci.yml` — type-check, lint, format check, build

**Editor (committed for any future contributor including future-you):**
- `.vscode/settings.json`
- `.vscode/extensions.json`

---

## Prerequisites

Before starting, verify on the local machine (macOS):

```bash
node --version    # v24.x.x (install via nvm or `brew install node@24`)
corepack --version # any (ships with Node 24)
gh --version      # 2.x.x (install via `brew install gh`)
gh auth status    # logged in to github.com
```

`pnpm` and `vercel` are activated/installed during Task 1 and Task 14 respectively.

If any check fails, install or authenticate before proceeding.

---

## Task 1: Verify prerequisites and activate pnpm

**Files:** none (environment setup)

- [ ] **Step 1: Run prerequisite checks**

```bash
node --version && gh --version && gh auth status
```

Expected: Node v24.x, gh 2.x, "Logged in to github.com". If any fails, install / authenticate before continuing.

- [ ] **Step 2: Activate pnpm via corepack**

```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

Expected: pnpm 10.x.x prints.

- [ ] **Step 3: Confirm working directory and git status**

```bash
pwd
git status
git log --oneline | head -10
```

Expected: working directory is `/Users/mark/Projects/chess-screenshot-analyzer`. Git history shows the spec commits (`e3e4f8f`, `0f5e28d`, `ee3df25`, `a729493`). Clean working tree.

---

## Task 2: Create GitHub repo and push existing commits

**Files:** none (remote setup)

- [ ] **Step 1: Create the public GitHub repo and link as `origin`**

```bash
gh repo create chess-screenshot-analyzer \
  --public \
  --description "PWA chess coaching agent — paste a screenshot, analyze with Stockfish + Gemini" \
  --source=. \
  --remote=origin
```

Expected: repo created at `https://github.com/<your-handle>/chess-screenshot-analyzer`; local `origin` remote configured.

- [ ] **Step 2: Push existing commits to GitHub**

```bash
git push -u origin main
```

Expected: spec, CLAUDE.md, and existing commits pushed; `origin/main` tracks local `main`.

- [ ] **Step 3: Verify the repo on GitHub**

```bash
gh repo view --web
```

Expected: browser opens to the repo; spec file is browsable in `docs/superpowers/specs/`.

---

## Task 3: Initialize Next.js scaffold

`create-next-app` with explicit flags. The directory is non-empty (already has `docs/`, `CLAUDE.md`, `.git/`); none of those collide with create-next-app's outputs.

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `tsconfig.json` (will rewrite in Task 4), `app/layout.tsx` (will rewrite in Task 13), `app/page.tsx`, `app/globals.css`, `postcss.config.mjs`, `next-env.d.ts`, `.gitignore`, `eslint.config.mjs` (will rewrite in Task 5), `public/*.svg` (placeholder)

- [ ] **Step 1: Run create-next-app**

```bash
pnpm dlx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*" \
  --use-pnpm \
  --eslint \
  --turbopack \
  --yes
```

Expected: scaffolded files appear; pnpm install runs; no errors. If prompted about an existing directory, accept (the `docs/`, `CLAUDE.md`, `.git/` files are untouched).

- [ ] **Step 2: Verify dev server starts**

```bash
pnpm dev
```

Expected: Next.js dev server starts on http://localhost:3000 with the default landing page. Open in browser to confirm. Stop with Ctrl-C.

- [ ] **Step 3: Verify production build succeeds**

```bash
pnpm build
```

Expected: build completes with no errors; `.next/` directory is created.

- [ ] **Step 4: Commit the scaffold**

```bash
git add .
git commit -m "$(cat <<'EOF'
chore: scaffold Next.js 16 + TS + Tailwind v4

create-next-app baseline. tsconfig, eslint, prettier, and app code are
tightened in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Tighten `tsconfig.json` (strict + footgun flags)

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Replace `tsconfig.json` with the strict configuration**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["dom", "dom.iterable", "esnext"],
    "jsx": "preserve",
    "allowJs": false,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "incremental": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: Run type-check to verify passes**

```bash
pnpm tsc --noEmit
```

Expected: no errors. The strict flags may flag default scaffold code — if so, fix in place (typically a small change in `app/page.tsx` or `next.config.ts`). Do not relax the flags.

- [ ] **Step 3: Add `typecheck` script to `package.json`**

In `package.json`, ensure `scripts` includes:

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 4: Verify the script works**

```bash
pnpm typecheck
```

Expected: same clean pass as Step 2.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json package.json
git commit -m "chore: enable strict TypeScript flags (Appendix C.4)"
```

---

## Task 5: ESLint flat config with footgun rules

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `package.json` (lint script + dev deps)

- [ ] **Step 1: Install ESLint plugins**

```bash
pnpm add -D \
  @typescript-eslint/eslint-plugin@latest \
  @typescript-eslint/parser@latest \
  typescript-eslint@latest \
  eslint-plugin-react-hooks@latest
```

- [ ] **Step 2: Replace `eslint.config.mjs`**

```js
// eslint.config.mjs
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default tseslint.config(
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "public/**"],
  },
);
```

- [ ] **Step 3: Ensure `package.json` has the lint script**

```json
"lint": "eslint ."
```

- [ ] **Step 4: Run lint to verify clean**

```bash
pnpm lint
```

Expected: no errors. If the scaffold code triggers any new rules, fix it in place — these rules are not optional.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs package.json pnpm-lock.yaml
git commit -m "chore: ESLint flat config with type-checked + footgun rules (Appendix C.4)"
```

---

## Task 6: Prettier + `.editorconfig`

**Files:**
- Create: `.prettierrc.json`, `.prettierignore`, `.editorconfig`
- Modify: `package.json`

- [ ] **Step 1: Install Prettier**

```bash
pnpm add -D prettier@latest prettier-plugin-tailwindcss@latest
```

- [ ] **Step 2: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
.next/
node_modules/
public/
pnpm-lock.yaml
*.md
```

(Markdown is excluded from Prettier because we use it for narrative docs where forced line wrapping is annoying.)

- [ ] **Step 4: Create `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 5: Add Prettier scripts to `package.json`**

In `scripts`:

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

- [ ] **Step 6: Format the existing codebase**

```bash
pnpm format
```

Expected: any unformatted files (scaffold output) are normalized.

- [ ] **Step 7: Verify format check passes**

```bash
pnpm format:check
```

Expected: "All matched files use Prettier code style!"

- [ ] **Step 8: Commit**

```bash
git add .prettierrc.json .prettierignore .editorconfig package.json pnpm-lock.yaml
git add -u  # picks up any files Prettier reformatted
git commit -m "chore: Prettier + EditorConfig"
```

---

## Task 7: husky + lint-staged pre-commit hook

**Files:**
- Create: `.husky/pre-commit`
- Modify: `package.json`

- [ ] **Step 1: Install husky + lint-staged**

```bash
pnpm add -D husky@latest lint-staged@latest
```

- [ ] **Step 2: Initialize husky**

```bash
pnpm exec husky init
```

Expected: `.husky/` directory created with a `pre-commit` file; `prepare` script added to `package.json`.

- [ ] **Step 3: Replace `.husky/pre-commit` contents**

```sh
pnpm exec lint-staged
```

- [ ] **Step 4: Add `lint-staged` config to `package.json`**

At top-level (sibling of `scripts`):

```json
"lint-staged": {
  "*.{ts,tsx}": [
    "eslint --fix",
    "prettier --write"
  ],
  "*.{js,jsx,mjs,cjs,json,css}": [
    "prettier --write"
  ]
}
```

- [ ] **Step 5: Make a no-op change and verify the hook fires**

```bash
echo "" >> README.md  # will need to exist; if not, create empty first
git add README.md
git commit -m "test: verify pre-commit hook"
```

Expected: pre-commit runs lint-staged; Prettier formats the file; commit succeeds.

Note: if `README.md` doesn't exist yet, replace this with a trivial change to `app/page.tsx` (e.g., add a space). It will be properly populated in Task 11.

- [ ] **Step 6: Commit the tooling itself**

```bash
git add .husky/ package.json pnpm-lock.yaml
git commit -m "chore: husky pre-commit + lint-staged"
```

---

## Task 8: Additional dotfiles (.env.example, .nvmrc, .gitignore)

**Files:**
- Create: `.env.example`, `.nvmrc`
- Modify: `.gitignore`, `package.json` (add `engines`)

- [ ] **Step 1: Create `.env.example`**

```
# Provisioned in later plans; copy to .env.local and fill with dev values.

# Plan 1 — Stockfish runs server-side, no API key needed
# (placeholder — uncomment as plans introduce them)

# GOOGLE_GENERATIVE_AI_API_KEY=
# AI_GATEWAY_API_KEY=
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=
# POSTHOG_KEY=
# NEXT_PUBLIC_POSTHOG_KEY=
# NEXT_PUBLIC_POSTHOG_HOST=
```

- [ ] **Step 2: Create `.nvmrc`**

```
24
```

- [ ] **Step 3: Add `engines` to `package.json`**

```json
"engines": {
  "node": ">=24.0.0",
  "pnpm": ">=10.0.0"
}
```

- [ ] **Step 4: Append to `.gitignore`**

After the existing entries, add:

```
# Local environment
.env
.env.local
.env.*.local

# Editor
.idea/
.DS_Store
*.swp

# Coverage / build artifacts
coverage/
.turbo/
```

- [ ] **Step 5: Commit**

```bash
git add .env.example .nvmrc .gitignore package.json
git commit -m "chore: .env.example, .nvmrc, engines field, expanded .gitignore"
```

---

## Task 9: VS Code workspace settings

**Files:**
- Create: `.vscode/settings.json`, `.vscode/extensions.json`

- [ ] **Step 1: Create `.vscode/settings.json`**

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "[markdown]": {
    "editor.formatOnSave": false
  }
}
```

- [ ] **Step 2: Create `.vscode/extensions.json`**

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "github.vscode-github-actions",
    "ms-vscode.vscode-typescript-next"
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add .vscode/
git commit -m "chore: VS Code workspace settings and recommended extensions"
```

---

## Task 10: Initialize shadcn/ui (no components yet)

shadcn is the design system primitive. Init only — components are added on demand in later plans.

**Files:**
- Create: `components.json`, `lib/utils.ts`
- Modify: `app/globals.css` (shadcn theme tokens)

- [ ] **Step 1: Run shadcn init**

```bash
pnpm dlx shadcn@latest init --yes --base-color zinc --css-variables
```

Expected: `components.json` created; `lib/utils.ts` (with `cn()` helper) created; `app/globals.css` extended with shadcn CSS variables.

- [ ] **Step 2: Verify the project still type-checks and lints**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Expected: all clean.

- [ ] **Step 3: Commit**

```bash
git add components.json lib/utils.ts app/globals.css
git commit -m "chore: initialize shadcn/ui (zinc, CSS variables)"
```

---

## Task 11: Project `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the auto-generated `README.md`**

```markdown
# Chess Screenshot Analyzer

A Progressive Web App for iOS Safari that analyzes chess positions from screenshots. Paste a board, get coached by an AI agent with a real chess engine.

**Status:** in active development — Plan 0 (rails) complete.

## Documents

- **Design spec:** [`docs/superpowers/specs/2026-05-16-chess-screenshot-analyzer-design.md`](docs/superpowers/specs/2026-05-16-chess-screenshot-analyzer-design.md)
- **Implementation plans:** [`docs/superpowers/plans/`](docs/superpowers/plans/)
- **Project context for AI sessions:** [`CLAUDE.md`](CLAUDE.md)

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

This project depends on GPL-3.0 libraries (chessground, chessops, Stockfish). Source is published per the GPL — see the linked repo for corresponding source.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: project README"
```

---

## Task 12: PWA manifest and placeholder icons

Minimal manifest so the app is installable to the iOS home screen from day one. Full PWA polish (service worker, A2HS banner) lands in Plan 7.

**Files:**
- Create: `public/manifest.webmanifest`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`

- [ ] **Step 1: Create `public/manifest.webmanifest`**

```json
{
  "name": "Chess Screenshot Analyzer",
  "short_name": "Chess Coach",
  "description": "Paste a chess position, get coached by an AI agent.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#09090b",
  "theme_color": "#09090b",
  "orientation": "portrait",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Generate placeholder PNG icons**

The icons are solid-color placeholders — any acceptable PNG of the right size works for v0. Generate three using ImageMagick (install via `brew install imagemagick` if missing):

```bash
magick -size 192x192 xc:'#09090b' public/icon-192.png
magick -size 512x512 xc:'#09090b' public/icon-512.png
magick -size 180x180 xc:'#09090b' public/apple-touch-icon.png
```

Expected: three PNG files in `public/`.

- [ ] **Step 3: Commit**

```bash
git add public/manifest.webmanifest public/icon-192.png public/icon-512.png public/apple-touch-icon.png
git commit -m "feat: PWA manifest and placeholder icons"
```

---

## Task 13: eruda dev console (mobile in-page devtools)

Mounted only in development. Lets you open dev tools on the installed iOS PWA.

**Files:**
- Create: `components/dev-console.tsx`

- [ ] **Step 1: Install eruda**

```bash
pnpm add -D eruda
```

(`-D` because we never want eruda in production bundles.)

- [ ] **Step 2: Create `components/dev-console.tsx`**

```tsx
"use client";

import { useEffect } from "react";

/**
 * Mounts the eruda in-page console in development only.
 * Lets you open dev tools on the installed iOS PWA (tap the bubble).
 *
 * Why: Safari Web Inspector requires USB + Mac; eruda works in-page.
 */
export function DevConsole() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    void import("eruda").then((eruda) => {
      eruda.default.init();
    });
  }, []);

  return null;
}
```

- [ ] **Step 3: Commit**

```bash
git add components/dev-console.tsx package.json pnpm-lock.yaml
git commit -m "chore: eruda in-page dev console (dev only)"
```

---

## Task 14: Wire root layout (manifest link, viewport, theme, eruda mount)

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx` (placeholder landing)

- [ ] **Step 1: Replace `app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DevConsole } from "@/components/dev-console";

export const metadata: Metadata = {
  title: "Chess Screenshot Analyzer",
  description: "Paste a chess position, get coached by an AI agent.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Chess Coach",
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-dvh antialiased">
        <DevConsole />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Replace `app/page.tsx` with a placeholder landing screen**

```tsx
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 pb-[env(safe-area-inset-bottom)]">
      <h1 className="text-2xl font-semibold">Chess Screenshot Analyzer</h1>
      <p className="text-muted-foreground mt-2 text-center text-sm">
        Plan 0 baseline. Plan 1 introduces the first interactive feature.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Verify type-check, lint, build still pass**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/page.tsx
git commit -m "feat: root layout with PWA metadata, viewport, eruda mount"
```

---

## Task 15: Vercel CLI authentication and project link

**Files:**
- Create: `vercel.ts`
- Vercel side: project created, linked

- [ ] **Step 1: Install Vercel CLI globally**

```bash
pnpm add -g vercel@latest
vercel --version
```

Expected: vercel 54.x.x.

- [ ] **Step 2: Authenticate Vercel CLI**

```bash
vercel login
```

Expected: browser-based login; CLI confirms authentication.

- [ ] **Step 3: Link to a new Vercel project under the Vidably team**

```bash
vercel link
```

Interactive prompts:
- "Set up `~/Projects/chess-screenshot-analyzer`?" → Yes
- Scope → select the Vidably team (NOT personal account)
- "Link to existing project?" → No
- Project name → `chess-screenshot-analyzer`
- Directory → `.`

Expected: `.vercel/` directory created (gitignored by default — verify in `.gitignore`); project visible on https://vercel.com/<vidably-team>/chess-screenshot-analyzer.

- [ ] **Step 4: Install `@vercel/config` and create `vercel.ts`**

```bash
pnpm add -D @vercel/config
```

Create `vercel.ts`:

```ts
import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "pnpm build",
  installCommand: "pnpm install --frozen-lockfile",
  outputDirectory: ".next",
};
```

- [ ] **Step 5: Ensure `.vercel/` is gitignored**

Inspect `.gitignore` — `.vercel` should already be present (added by `vercel link`). If not, add:

```
.vercel
```

- [ ] **Step 6: Commit**

```bash
git add vercel.ts package.json pnpm-lock.yaml .gitignore
git commit -m "chore: vercel.ts config + project linked under Vidably team"
```

---

## Task 16: Vercel deployment protection on previews

**Files:** none (Vercel dashboard configuration)

- [ ] **Step 1: Open Vercel project settings**

```bash
vercel inspect --web
```

Or navigate manually to https://vercel.com/<vidably-team>/chess-screenshot-analyzer/settings/deployment-protection.

- [ ] **Step 2: Enable Vercel Authentication for Preview deployments**

In Deployment Protection:
- Vercel Authentication → Standard
- Apply to: **Preview deployments only**
- Production: leave public (unlinked URL stays private in practice)

Expected: preview URLs now require a Vercel login to access. Production URL stays public.

- [ ] **Step 3: Confirm via a no-op push**

This task has no commit — it's a dashboard change. The next push will produce a preview URL with the new protection. Verify in Task 18.

---

## Task 17: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: ["main"]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    name: Type-check, lint, format, build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type-check
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Format check
        run: pnpm format:check

      - name: Build
        run: pnpm build
        env:
          NEXT_TELEMETRY_DISABLED: "1"
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: type-check + lint + format + build on every push"
```

---

## Task 18: First push, verify auto-deploy + CI

**Files:** none (verification)

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Verify CI runs and passes**

```bash
gh run watch
```

Expected: CI workflow runs; all four jobs (typecheck, lint, format check, build) pass. If a step fails, fix and push again.

- [ ] **Step 3: Verify Vercel auto-deploys to production**

```bash
vercel ls
```

Or open https://vercel.com/<vidably-team>/chess-screenshot-analyzer. Latest deployment to the `main` branch should be in `Ready` state for production.

- [ ] **Step 4: Get the production URL**

```bash
vercel ls --prod
```

Expected: one URL printed, format `https://chess-screenshot-analyzer-<hash>.vercel.app` or the project's assigned domain.

---

## Task 19: Install the PWA on your phone

**Files:** none (phone setup)

- [ ] **Step 1: Open the production URL on iOS Safari**

On the iPhone, open Safari and navigate to the URL from Task 18. Expected: the placeholder landing screen renders ("Chess Screenshot Analyzer / Plan 0 baseline...").

- [ ] **Step 2: Add to Home Screen**

Tap Share → "Add to Home Screen" → Add.

Expected: app icon appears on the home screen; tapping it launches in standalone mode (no Safari chrome). Status bar respects the `black-translucent` style.

- [ ] **Step 3: Verify eruda is mounted in dev (test on localhost from a phone if possible)**

Optional but valuable: run `pnpm dev` and reach `http://<your-laptop-ip>:3000` from the phone on the same Wi-Fi. Expected: a small floating bubble in the bottom-right corner that opens the eruda console. (Don't expect this on the production URL — eruda is dev-only.)

- [ ] **Step 4: Install the Vercel mobile app**

App Store → "Vercel". Sign in. Receive deploy notifications + dashboard access from phone.

---

## Task 20: Final verification and Plan 0 completion

**Files:** `README.md` (status update)

- [ ] **Step 1: Confirm all rails are working**

Local:

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

Expected: all pass.

Remote:

```bash
gh run list --limit 1
vercel ls --prod | head -2
```

Expected: latest CI green, latest production deploy in `Ready` state.

Phone: tapping the home-screen icon launches the standalone PWA showing the landing screen.

- [ ] **Step 2: Update README status line**

In `README.md`, change:

```
**Status:** in active development — Plan 0 (rails) complete.
```

(Already set in Task 11 — verify still correct.)

- [ ] **Step 3: Final commit and push**

```bash
git add README.md
git diff --cached --quiet || git commit -m "docs: Plan 0 complete — rails verified end-to-end"
git push origin main
```

If there were no changes, the commit is skipped (the `--quiet` check).

---

## Done

At this point you have:

- A public GitHub repo (`chess-screenshot-analyzer`)
- A Vercel project under the Vidably team auto-deploying on every push to `main`
- TypeScript strict, ESLint with footgun rules, Prettier, husky pre-commit, GitHub Actions CI all enforcing quality
- A phone-installable PWA running on a real Vercel URL
- eruda dev console available locally for mobile debugging
- shadcn/ui initialized (no components yet — added on demand)
- `.env.example` ready for environment variables that future plans introduce
- The Vercel mobile app for deploy notifications

Plan 1 (Static board + engine call) builds on this directly: it adds `chessground`, `chessops`, `@se-oss/stockfish`, a server route, and a button that triggers the full client→server→engine→client loop.
