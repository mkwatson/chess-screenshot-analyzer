"use client";

import { useEffect } from "react";

/**
 * Mounts the eruda in-page console in development only.
 * Lets you open dev tools on the installed iOS PWA (tap the floating bubble).
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
