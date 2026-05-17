/// <reference lib="webworker" />
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
  // __SW_MANIFEST is injected by @serwist/next at build time; fall back to []
  // to satisfy exactOptionalPropertyTypes (SerwistOptions.precacheEntries is
  // (PrecacheEntry | string)[], not (PrecacheEntry | string)[] | undefined).
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
