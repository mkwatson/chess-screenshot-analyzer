import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";
import { ParseInputSchema, type ParseInput, type ParseOutput } from "./types";

// Model: gemini-3.1-flash-lite + structured 8x8-grid output is strictly
// optimal for board parsing — see scripts/test-vision.py and AGENTS.md
// "structured output > free-form when there's a schema-able answer".
const MODEL = google("gemini-3.1-flash-lite");

// Use "." for an empty square (chess display convention). Gemini's response
// schema REJECTS empty-string enum values — see AGENTS.md "responseSchema
// enums".
const PieceCell = z.enum([".", "p", "n", "b", "r", "q", "k", "P", "N", "B", "R", "Q", "K"]);
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
Use "." for empty squares. Use lowercase for black pieces (p n b r q k) \
and uppercase for white (P N B R Q K). board[0] is rank 8 (top of image, black's back rank); \
board[7] is rank 1 (bottom, white's back rank). Within each row, index 0 is file a, index 7 is file h.`;

// FEN row encoding is a run-length fold: ["r","",".","b"] → "r2b".
// Carries { encoded, runOfEmpties } through the row; flushes the run on each
// non-empty cell and at the end.
interface FenAcc {
  readonly encoded: string;
  readonly run: number;
}
const flushRun = ({ encoded, run }: FenAcc): string => (run > 0 ? `${encoded}${run}` : encoded);
const rowToFen = (row: readonly z.infer<typeof PieceCell>[]): string =>
  flushRun(
    row.reduce<FenAcc>(
      (acc, cell) =>
        cell === "."
          ? { encoded: acc.encoded, run: acc.run + 1 }
          : { encoded: `${flushRun(acc)}${cell}`, run: 0 },
      { encoded: "", run: 0 },
    ),
  );

// Default meta fields when the model returns blanks. The chess engine doesn't
// depend on these for finding the best move from a piece placement; refine via
// editPosition (Plan 6).
const defaultCastling = (s: string): string => (/^[KQkq]+$/.test(s) ? s : "KQkq");
const defaultEnPassant = (s: string): string => (/^[a-h][36]$/.test(s) ? s : "-");

const gridToFen = (g: z.infer<typeof GridSchema>): string =>
  [
    g.board.map(rowToFen).join("/"),
    g.sideToMove,
    defaultCastling(g.castling),
    defaultEnPassant(g.enPassant),
    "0",
    "1",
  ].join(" ");

type Legality = { ok: true } | { ok: false; reason: string };
const isLegalFen = (fen: string): Legality => {
  const parsed = parseFen(fen);
  if (parsed.isErr) return { ok: false, reason: parsed.error.message };
  const pos = Chess.fromSetup(parsed.value);
  if (pos.isErr) return { ok: false, reason: pos.error.message };
  return { ok: true };
};

const callGemini = async (args: {
  readonly imageBase64: string;
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp";
  readonly retryFeedback?: string;
}): Promise<{ fen: string; sideToMove: "w" | "b" }> => {
  const prompt =
    args.retryFeedback !== undefined
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
};

// One attempt: call Gemini, check legality. Returns a discriminated result;
// the catch-and-wrap turns any thrown error into ok:false vision_error so the
// caller can stay linear (no try/catch reassignment dance).
type Attempt =
  | { ok: true; fen: string; sideToMove: "w" | "b" }
  | { ok: false; reason: "vision_error" | "illegal_position"; detail: string };

const tryParse = async (input: ParseInput, retryFeedback?: string): Promise<Attempt> => {
  try {
    // `exactOptionalPropertyTypes`: spread retryFeedback only when defined,
    // so the key isn't present with an undefined value.
    const out = await callGemini(retryFeedback !== undefined ? { ...input, retryFeedback } : input);
    const legality = isLegalFen(out.fen);
    return legality.ok
      ? { ok: true, ...out }
      : { ok: false, reason: "illegal_position", detail: legality.reason };
  } catch (e) {
    return {
      ok: false,
      reason: "vision_error",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
};

const toSuccess = (a: Extract<Attempt, { ok: true }>): ParseOutput => ({
  ok: true,
  data: { fen: a.fen, sideToMove: a.sideToMove },
});

export const parseScreenshot = async (rawInput: unknown): Promise<ParseOutput> => {
  const parsed = ParseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, reason: "invalid_input", detail: parsed.error.message };
  }

  const first = await tryParse(parsed.data);
  if (first.ok) return toSuccess(first);
  // Only retry illegal_position; vision_error is final.
  if (first.reason !== "illegal_position") return first;

  const retry = await tryParse(parsed.data, first.detail);
  return retry.ok ? toSuccess(retry) : retry;
};
