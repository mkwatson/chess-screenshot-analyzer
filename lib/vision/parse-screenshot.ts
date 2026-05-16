import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";
import { ParseInputSchema, type ParseOutput } from "./types";

// Model: gemini-3.1-flash-lite + structured 8x8-grid output is strictly
// optimal for board parsing — see scripts/test-vision.py and AGENTS.md
// "structured output > free-form when there's a schema-able answer".
const MODEL = google("gemini-3.1-flash-lite");

// Empty string for an empty square; otherwise one chess-piece letter.
const PieceCell = z.enum(["", "p", "n", "b", "r", "q", "k", "P", "N", "B", "R", "Q", "K"]);
const Row = z.array(PieceCell).length(8);
const GridSchema = z.object({
  // board[0] = rank 8 (top of image), board[7] = rank 1.
  // board[*][0] = file a (left of image), board[*][7] = file h.
  board: z.array(Row).length(8),
  sideToMove: z.enum(["w", "b"]),
  // castling/enPassant are best-effort — we default if model returns empties.
  castling: z.string(),
  enPassant: z.string(),
});

const SYSTEM_INSTRUCTION = `You parse a chess board image and return the piece on every square. \
Use empty string for empty squares. Use lowercase for black pieces (p n b r q k) \
and uppercase for white (P N B R Q K). board[0] is rank 8 (top of image, black's back rank); \
board[7] is rank 1 (bottom, white's back rank). Within each row, index 0 is file a, index 7 is file h.`;

function gridToFen(g: z.infer<typeof GridSchema>): string {
  const ranks = g.board.map((row) => {
    let s = "";
    let empty = 0;
    for (const cell of row) {
      if (cell === "") {
        empty += 1;
      } else {
        if (empty > 0) {
          s += String(empty);
          empty = 0;
        }
        s += cell;
      }
    }
    if (empty > 0) s += String(empty);
    return s;
  });
  // Default the meta fields when the model returns blanks. KQkq is correct for
  // any position where neither king nor rook has been confirmed as moved — the
  // chess engine will still find the right best-move from the piece placement;
  // it just may overstate castling rights. Refine via editPosition (Plan 6).
  const castling = /^[KQkq]+$/.test(g.castling) ? g.castling : "KQkq";
  const enPassant = /^[a-h][36]$/.test(g.enPassant) ? g.enPassant : "-";
  return `${ranks.join("/")} ${g.sideToMove} ${castling} ${enPassant} 0 1`;
}

function isLegalFen(fen: string): { ok: true } | { ok: false; reason: string } {
  const parsed = parseFen(fen);
  if (parsed.isErr) return { ok: false, reason: parsed.error.message };
  const pos = Chess.fromSetup(parsed.value);
  if (pos.isErr) return { ok: false, reason: pos.error.message };
  return { ok: true };
}

async function callGemini(args: {
  imageBase64: string;
  mimeType: string;
  retryFeedback?: string;
}): Promise<{ fen: string; sideToMove: "w" | "b" }> {
  const prompt = args.retryFeedback
    ? `The previous parse produced an illegal position: ${args.retryFeedback}. Re-examine each square carefully.`
    : "Identify the piece on every square.";

  const result = await generateObject({
    model: MODEL,
    system: SYSTEM_INSTRUCTION,
    schema: GridSchema,
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
        mediaResolution: "MEDIA_RESOLUTION_HIGH",
        thinkingConfig: { thinkingLevel: "low" },
      },
    },
  });

  return { fen: gridToFen(result.object), sideToMove: result.object.sideToMove };
}

export async function parseScreenshot(rawInput: unknown): Promise<ParseOutput> {
  const parsed = ParseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, reason: "invalid_input", detail: parsed.error.message };
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
    data: { fen: attempt.fen, sideToMove: attempt.sideToMove },
  };
}
