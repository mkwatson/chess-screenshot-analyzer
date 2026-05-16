import { NextResponse } from "next/server";
import { parseScreenshot } from "@/lib/vision/parse-screenshot";
import type { ParseOutput } from "@/lib/vision/types";

export const runtime = "nodejs";
export const maxDuration = 30;

function statusFor(result: ParseOutput): number {
  if (result.ok) return 200;
  switch (result.reason) {
    case "invalid_input":
      return 400;
    case "no_chess_board_detected":
    case "illegal_position":
    case "low_confidence":
      return 422;
    case "vision_error":
      return 502;
  }
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const out: ParseOutput = {
      ok: false,
      reason: "invalid_input",
      detail: "Body is not valid JSON",
    };
    return NextResponse.json(out, { status: 400 });
  }

  const result = await parseScreenshot(body);
  return NextResponse.json(result, { status: statusFor(result) });
}
