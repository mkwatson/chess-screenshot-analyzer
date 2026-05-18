"use client";

import { useEffect, useRef, useState } from "react";

interface Metrics {
  readonly tick: number;
  readonly ts: string;
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly clientHeight: number;
  readonly visualHeight: number;
  readonly visualOffsetTop: number;
  readonly dvh: number;
  readonly svh: number;
  readonly lvh: number;
  readonly safeTop: number;
  readonly safeBottom: number;
  readonly standalone: boolean;
}

const probeBase = {
  position: "fixed",
  left: -9999,
  top: 0,
  width: 1,
  pointerEvents: "none",
} as const;

const detectStandalone = (): boolean => {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
};

export function ViewportDebug(): React.JSX.Element {
  const dvhRef = useRef<HTMLDivElement | null>(null);
  const svhRef = useRef<HTMLDivElement | null>(null);
  const lvhRef = useRef<HTMLDivElement | null>(null);
  const safeRef = useRef<HTMLDivElement | null>(null);
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    let tick = 0;
    const measure = (): void => {
      tick++;
      const safe = safeRef.current ? getComputedStyle(safeRef.current) : null;
      setM({
        tick,
        ts: new Date().toISOString().slice(11, 23),
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        clientHeight: document.documentElement.clientHeight,
        visualHeight: window.visualViewport?.height ?? -1,
        visualOffsetTop: window.visualViewport?.offsetTop ?? -1,
        dvh: dvhRef.current?.offsetHeight ?? -1,
        svh: svhRef.current?.offsetHeight ?? -1,
        lvh: lvhRef.current?.offsetHeight ?? -1,
        safeTop: safe ? parseFloat(safe.paddingTop) : -1,
        safeBottom: safe ? parseFloat(safe.paddingBottom) : -1,
        standalone: detectStandalone(),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, []);

  return (
    <>
      <div ref={dvhRef} style={{ ...probeBase, height: "100dvh" }} aria-hidden />
      <div ref={svhRef} style={{ ...probeBase, height: "100svh" }} aria-hidden />
      <div ref={lvhRef} style={{ ...probeBase, height: "100lvh" }} aria-hidden />
      <div
        ref={safeRef}
        style={{
          ...probeBase,
          height: 1,
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
          boxSizing: "content-box",
        }}
        aria-hidden
      />
      {m !== null && (
        <div
          style={{
            position: "fixed",
            right: 4,
            bottom: 4,
            zIndex: 9999,
            background: "rgba(0,0,0,0.78)",
            color: "#7fff00",
            font: "10px ui-monospace, SFMono-Regular, monospace",
            padding: "4px 6px",
            borderRadius: 4,
            pointerEvents: "none",
            lineHeight: 1.3,
            whiteSpace: "pre",
          }}
        >
          {[
            `#${m.tick} ${m.ts} ${m.standalone ? "pwa" : "web"}`,
            `iw×ih  ${m.innerWidth}×${m.innerHeight}`,
            `clntH  ${m.clientHeight}`,
            `vv.h   ${m.visualHeight.toFixed(0)} off${m.visualOffsetTop.toFixed(0)}`,
            `dvh    ${m.dvh}`,
            `svh    ${m.svh}`,
            `lvh    ${m.lvh}`,
            `safe   t${m.safeTop} b${m.safeBottom}`,
          ].join("\n")}
        </div>
      )}
    </>
  );
}
