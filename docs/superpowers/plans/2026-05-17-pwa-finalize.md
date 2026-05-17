# PWA Finalize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop the iOS PWA from serving stale code after a deploy. Force-quit + re-add is the current workaround; this plan replaces it with `skipWaiting + clientsClaim` so the new build takes over immediately on next reload.

**Architecture:** Add a `@serwist/next`-generated service worker. Precache the Next.js app shell (auto). `NetworkOnly` for `/api/*` (chat must never come from cache). `StaleWhileRevalidate` for static assets. Service worker activates immediately on update (no waiting for all tabs to close). Manifest + viewport + iOS meta tags are already in place from Plan 0.

**Tech Stack:** `@serwist/next` (the maintained successor to `next-pwa`, used per AGENTS.md tech stack).

---

## Scope notes (per principles)

- **One file matters: the service worker.** Manifest, viewport meta, theme color, apple-touch-icon, and `interactive-widget=resizes-content` are already shipped in `app/layout.tsx` + `public/manifest.webmanifest` (Plan 0).
- **No A2HS banner in v0.** You've already added the PWA to your home screen. The "Add to Home Screen" prompt for new users is a Plan 9 (polish) concern.
- **No "new version available" toast.** `skipWaiting + clientsClaim` means the next reload IS the new version. A toast is nice but not necessary; defer to Plan 9 if it turns out to be confusing in daily use.
- **No background sync, no offline fallback page.** Background sync isn't supported on iOS Safari. An offline page is overkill for a chat app whose entire value comes from the server.
- **No precache list customization.** `@serwist/next` auto-precaches Next's build manifest. We don't need to tune what's cached for v0.
- **No tests.** Service-worker behavior is library-implemented; verifying it via repeated builds + iPhone reloads in Plan 7's smoke is the cheapest deterministic check (per shift-left hierarchy: types/lint can't cover this; preview deploys can).

## File structure

- Create: `app/sw.ts` — service worker entry (serwist convention)
- Modify: `next.config.ts` — wrap with `withSerwist`
- Modify: `tsconfig.json` — add `WebWorker` to lib for the sw.ts file (or scope via override)
- Modify: `package.json` — add `@serwist/next` and `serwist`
- Modify: `CLAUDE.md` — mark Plan 7 SHIPPED; remove the "iOS PWA standalone-mode caching" known-follow-up since it's now addressed

No tests. The iPhone smoke (Task 4) is the deterministic check.

---

## Task 1: Install + minimal configuration

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `app/sw.ts`
- Modify: `next.config.ts`

- [ ] **Step 1: Install**

```bash
pnpm add @serwist/next serwist
```

- [ ] **Step 2: Verify versions**

```bash
pnpm list @serwist/next serwist
```

Expected: `@serwist/next` and `serwist` listed. As of this writing, both should be 9.x.

- [ ] **Step 3: Create `app/sw.ts`**

Serwist's Next.js plugin compiles this file into a service worker bundle. Keep it minimal:

```ts
// app/sw.ts
import { defaultCache } from "@serwist/next/worker";
import { type PrecacheEntry, type SerwistGlobalConfig, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // injected by @serwist/next at build time
    readonly __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// `skipWaiting` + `clientsClaim`: the moment a new SW is installed, it
// takes over all open clients on the next navigation/reload. Without
// these, iOS PWA users would see the old build for as long as their
// tab/standalone instance stayed alive — the exact bug we're fixing.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

The `defaultCache` from `@serwist/next/worker` includes sensible defaults:
- `NetworkOnly` for `POST` requests (so `/api/chat` is never cached)
- `StaleWhileRevalidate` for Next static chunks, fonts, images
- `NetworkFirst` for HTML navigation

If something in `defaultCache` turns out to be wrong for us later (we discover an unexpected cache), we can replace `runtimeCaching: defaultCache` with a custom array — but start with defaults.

- [ ] **Step 4: Wrap `next.config.ts`**

Current `next.config.ts` has Stockfish WASM tracing for `/api/chat`. Add Serwist's wrapper around the export:

```ts
// next.config.ts
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  // ... existing config (serverExternalPackages, outputFileTracingIncludes, etc.)
};

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // In dev, the service worker is disabled (would interfere with HMR).
  // We test it on Vercel preview / prod only.
  disable: process.env.NODE_ENV !== "production",
});

export default withSerwist(nextConfig);
```

Match the structure to whatever the current next.config.ts uses (default export vs named). Open it first; the integration is one extra import + one wrap.

- [ ] **Step 5: Add `app/sw.ts` to `tsconfig.json` ignore-list-for-strict-checks if needed**

If tsc complains about `app/sw.ts` not finding `ServiceWorkerGlobalScope` or `WorkerGlobalScope`, two options:

- Add `WebWorker` to `compilerOptions.lib`: but this affects all files. Avoid.
- Use a typed-comment `/// <reference lib="webworker" />` at the top of `app/sw.ts`. Cleanest.

```ts
/// <reference lib="webworker" />
// at the top of app/sw.ts
```

- [ ] **Step 6: Build smoke**

```bash
pnpm typecheck && pnpm lint && pnpm format:check
pnpm build 2>&1 | tail -20
git checkout -- tsconfig.json   # in case Next 16 mutated it
```

Expected: build succeeds, the build summary shows `public/sw.js` was generated (look for "Generating service worker" or similar in the output). The route table should still include `/` and `/api/chat`.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml app/sw.ts next.config.ts
git commit -m "feat(pwa): @serwist/next service worker with skipWaiting + clientsClaim

Fixes the iOS PWA stale-cache problem: previously, a deploy didn't
take effect on the home-screen PWA until force-quit + re-add. With
skipWaiting + clientsClaim the new service worker activates on the
next reload.

NetworkOnly for POST (i.e. /api/chat is never cached), StaleWhileRevalidate
for static, NetworkFirst for HTML — via @serwist/next/worker's
defaultCache. Disabled in dev to avoid HMR interference.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Verify dev server still works

**Files:** none

The service worker is disabled in dev (`disable: process.env.NODE_ENV !== "production"`), so dev should be unchanged.

- [ ] **Step 1: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Open `http://localhost:3000` in Chrome**

Verify:
- Page loads normally
- No service-worker console errors
- Existing chat surface works

DevTools → Application → Service Workers should show "no service worker" (because dev disables it).

- [ ] **Step 3: Stop dev. No commit needed.**

---

## Task 3: Verify production build registers the SW

**Files:** none

- [ ] **Step 1: Production build + start locally**

```bash
pnpm build
pnpm start
```

- [ ] **Step 2: Open `http://localhost:3000` in Chrome (new incognito or hard-reload)**

DevTools → Application → Service Workers: should show `sw.js` registered, status "activated".

DevTools → Application → Cache Storage: should show entries for the Next static chunks.

- [ ] **Step 3: Test the cache-busting**

Stop `pnpm start`. Change a visible string in the app (e.g., the welcome heading in `components/assistant-ui/thread.tsx`). Run `pnpm build` again. Run `pnpm start` again. Reload the browser — the change should appear immediately on the FIRST reload (no second-reload-required).

Revert your test change before committing.

- [ ] **Step 4: Stop. No commit needed.**

---

## Task 4: Deploy + iPhone test (Mark)

**Files:** none

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Wait for Vercel ready**

```bash
until vercel ls chess-screenshot-analyzer --prod 2>&1 | grep -E "Ready|Error" | head -1 | grep -q "Ready"; do sleep 10; done
```

- [ ] **Step 3: HTTP smoke**

```bash
PROD="https://chess-screenshot-analyzer-two.vercel.app"
curl -sI "$PROD/" | head -1
curl -sI "$PROD/sw.js" | head -1
```

Expected: both 200. The `/sw.js` URL is the compiled service worker that serwist generates.

- [ ] **Step 4: iPhone test (Mark)**

This is the actual proof:

1. **Critical first step:** open the URL in Safari (NOT the PWA) once. The service worker installs on the FIRST visit.
2. Force-quit + reopen your home-screen PWA. The PWA picks up the now-installed service worker on first reload.
3. **The real test — deploy verification:** I make a small visible change (a heading or composer placeholder), push, wait for Vercel ready. You force-quit + reopen your home-screen PWA. The new change should appear on the FIRST reload, no longer requiring re-install.

If step 3 doesn't work — service worker is installed but not auto-updating — we have to look at `register` semantics + the manifest's `start_url` cache rules.

---

## Task 5: Close out — CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the Plan 7 line + remove the iOS-PWA-caching follow-up**

In the execution-state block:

```
- **Plan 7 (PWA finalize) — SHIPPED.** `@serwist/next` service worker with skipWaiting + clientsClaim — iOS home-screen PWA now picks up new deploys on the next reload (no more force-quit + re-add). NetworkOnly for POST so `/api/chat` is never cached; `StaleWhileRevalidate` for static; `NetworkFirst` for HTML navigation, all via `@serwist/next/worker` `defaultCache`. Service worker disabled in dev. Manifest + viewport + iOS meta tags shipped earlier in Plan 0.
- **Next plan:** Slice 8 — Resumable streams + observability. Plan document not yet written.
```

In the "Known follow-ups" block, remove the bullet:

```
- **iOS PWA standalone-mode caching:** … Plan 7 (PWA finalize) MUST address this …
```

(It's resolved.)

- [ ] **Step 2: Commit + push**

```bash
git add CLAUDE.md
git commit -m "docs: mark Plan 7 complete; resume marker → Slice 8

Removes the iOS PWA stale-cache follow-up from the known-issues list
since it's now resolved by @serwist/next."
git push origin main
```

---

## Done

End state:
- Home-screen PWA picks up new deploys on the first reload.
- No stale-cache pain. No force-quit + re-add ritual.
- The known follow-up that's been on the list since Plan 0 is finally gone.

What's still deferred (intentional):
- **A2HS banner** — Plan 9 (polish). You're already installed.
- **"New version available" toast** — Plan 9 if it turns out to be helpful.
- **Custom precache strategies / offline page** — overkill for a chat-app PWA.
- **Background sync** — not supported on iOS Safari anyway.
