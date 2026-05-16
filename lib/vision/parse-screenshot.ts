import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";
import { ParseInputSchema, type ParseOutput } from "./types";

// Output schema for the Gemini call. Wider than ParseOutputSchema's success
// branch — Gemini sometimes returns trailing whitespace or extra fields that
// don't violate the schema but aren't strictly the FEN regex; we re-validate
// downstream via chessops.
const GeminiOutputSchema = z.object({
  fen: z.string().min(1),
  sideToMove: z.enum(["w", "b"]),
  confidence: z.number().min(0).max(1),
});

const SYSTEM_INSTRUCTION = `You are a chess board image parser. Given an image \
containing a chess position, return the FEN representation in standard format \
(piece placement / side / castling / en passant / halfmove / fullmove). Use \
uppercase letters for white pieces and lowercase for black. If you cannot \
detect a chess board in the image, respond with confidence: 0 and best-guess \
empty board. Confidence is your subjective certainty in the parse (0-1).`;

// Direct Google AI Studio provider (bypassing the Vercel AI Gateway).
// Reason: as of 2026-05-16 the Gateway is throttling free credits due to abuse.
// Model choice: `gemini-2.5-flash` is the current GA Flash that Vercel's own
// docs use; `gemini-3-flash-preview` exists but is preview-tagged. The spec
// originally said "gemini-3-flash" but that model ID was never released —
// 3 Pro is `gemini-3-pro-preview`, 3 Flash is `gemini-3-flash-preview`. Stick
// to 2.5-flash until 3-flash is GA. Vision capability + responseSchema +
// thinking knobs all supported on 2.5-flash.
const MODEL = google("gemini-2.5-flash");

function isLegalFen(fen: string): { ok: true } | { ok: false; reason: string } {
  const parsed = parseFen(fen);
  if (parsed.isErr) {
    return { ok: false, reason: parsed.error.message };
  }
  const pos = Chess.fromSetup(parsed.value);
  if (pos.isErr) {
    return { ok: false, reason: pos.error.message };
  }
  return { ok: true };
}

async function callGemini(args: {
  imageBase64: string;
  mimeType: string;
  retryFeedback?: string;
}): Promise<{ fen: string; sideToMove: "w" | "b"; confidence: number }> {
  const prompt = args.retryFeedback
    ? `The previous parse produced an illegal position: ${args.retryFeedback}. Try again carefully, paying close attention to piece positions.`
    : "Read this chess position and return the FEN.";

  const result = await generateObject({
    model: MODEL,
    system: SYSTEM_INSTRUCTION,
    schema: GeminiOutputSchema,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            image: Buffer.from(args.imageBase64, "base64"),
            mediaType: args.mimeType,
          },
          { type: "text", text: prompt },
        ],
      },
    ],
    providerOptions: {
      google: {
        // gemini-2.5-flash: thinkingBudget is a token cap (0 disables thinking
        // entirely). Vision parse doesn't need reasoning. When we move to
        // gemini-3-*-preview, switch to thinkingLevel: 'minimal' instead.
        thinkingConfig: { thinkingBudget: 0 },
      },
    },
  });

  return result.object;
}

export async function parseScreenshot(rawInput: unknown): Promise<ParseOutput> {
  const parsed = ParseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_input",
      detail: parsed.error.message,
    };
  }

  let attempt: Awaited<ReturnType<typeof callGemini>>;
  try {
    attempt = await callGemini({
      imageBase64: parsed.data.imageBase64,
      mimeType: parsed.data.mimeType,
    });
  } catch (e) {
    return {
      ok: false,
      reason: "vision_error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  let legality = isLegalFen(attempt.fen);
  if (!legality.ok) {
    try {
      const retried = await callGemini({
        imageBase64: parsed.data.imageBase64,
        mimeType: parsed.data.mimeType,
        retryFeedback: legality.reason,
      });
      const retryLegality = isLegalFen(retried.fen);
      if (!retryLegality.ok) {
        return {
          ok: false,
          reason: "illegal_position",
          detail: retryLegality.reason,
        };
      }
      attempt = retried;
      legality = retryLegality;
    } catch (e) {
      return {
        ok: false,
        reason: "vision_error",
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return {
    ok: true,
    data: {
      fen: attempt.fen,
      sideToMove: attempt.sideToMove,
      confidence: attempt.confidence,
    },
  };
}
