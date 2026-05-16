import { z } from "zod";
import { FenSchema } from "@/lib/engine/types";

// Base64-encoded image; cap at ~8 MB encoded (roughly 6 MB raw) to bound
// request size. Real chess screenshots from phones are typically under 500 KB.
const MAX_BASE64_CHARS = 8 * 1024 * 1024;

export const ParseInputSchema = z.object({
  imageBase64: z.string().min(1).max(MAX_BASE64_CHARS),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});
export type ParseInput = z.infer<typeof ParseInputSchema>;

const ParseSuccessSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    fen: FenSchema,
    sideToMove: z.enum(["w", "b"]),
  }),
});

const ParseFailureSchema = z.object({
  ok: z.literal(false),
  reason: z.enum(["illegal_position", "vision_error", "invalid_input"]),
  detail: z.string().optional(),
});

export const ParseOutputSchema = z.discriminatedUnion("ok", [
  ParseSuccessSchema,
  ParseFailureSchema,
]);
export type ParseOutput = z.infer<typeof ParseOutputSchema>;
