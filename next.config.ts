import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  // @se-oss/stockfish spawns a child Node process that loads a .wasm sibling
  // via __dirname. Letting Turbopack bundle it strips that filesystem layout,
  // so the child can't find the WASM and exits with code 7.
  serverExternalPackages: ["@se-oss/stockfish"],

  // Vercel's output file tracer doesn't follow runtime spawn() targets. We
  // must explicitly include the package's dist/ (child script + WASM) in the
  // function deployment for /api/chat (the agent loop's analyzePosition tool
  // spawns Stockfish server-side).
  //
  // PNPM REAL-PATH GLOB: `./node_modules/@se-oss/stockfish` is a symlink in
  // pnpm's layout. In webpack-mode (which @serwist/next requires) the tracer
  // emits the symlinked path verbatim, which Vercel's deploy step rejects
  // ("invalid deployment package … symlinked directories"). The wildcard
  // version pattern matches across upgrades. Turbopack-mode dereferences
  // automatically; this glob covers both.
  outputFileTracingIncludes: {
    "/api/chat": [
      "./node_modules/.pnpm/@se-oss+stockfish@*/node_modules/@se-oss/stockfish/dist/**/*",
    ],
  },
};

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
});

export default withSerwist(nextConfig);
