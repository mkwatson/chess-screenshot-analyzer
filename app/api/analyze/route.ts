import { NextResponse } from "next/server";
import { analyzePosition } from "@/lib/engine/stockfish";
import { AnalyzeInputSchema, type AnalyzeOutput } from "@/lib/engine/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const out: AnalyzeOutput = {
      ok: false,
      reason: "invalid_position",
      detail: "Body is not valid JSON",
    };
    return NextResponse.json(out, { status: 400 });
  }

  const parsed = AnalyzeInputSchema.safeParse(body);
  if (!parsed.success) {
    const out: AnalyzeOutput = {
      ok: false,
      reason: "invalid_position",
      detail: parsed.error.message,
    };
    return NextResponse.json(out, { status: 400 });
  }

  const result = await analyzePosition(parsed.data);
  const status = result.ok ? 200 : result.reason === "invalid_position" ? 400 : 500;
  return NextResponse.json(result, { status });
}
