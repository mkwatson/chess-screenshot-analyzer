import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @se-oss/stockfish spawns a child Node process that loads a .wasm sibling
  // via __dirname. Letting Turbopack bundle it strips that filesystem layout,
  // so the child can't find the WASM and exits with code 7.
  serverExternalPackages: ["@se-oss/stockfish"],

  // Vercel's output file tracer doesn't follow runtime spawn() targets. We
  // must explicitly include the package's dist/ (child script + WASM) in the
  // function deployment for /api/analyze.
  outputFileTracingIncludes: {
    "/api/analyze": ["./node_modules/@se-oss/stockfish/dist/**/*"],
  },
};

export default nextConfig;
