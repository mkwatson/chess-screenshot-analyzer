import { z } from "zod";
import { FenSchema } from "@/lib/engine/types";

const SquareSchema = z.string().regex(/^[a-h][1-8]$/, "must be a square like e4");

const ArrowBrushSchema = z.enum(["green", "red", "blue", "yellow"]);

const ArrowSchema = z.object({
  from: SquareSchema,
  to: SquareSchema,
  color: ArrowBrushSchema.optional(),
});

const MoveSchema = z.object({
  from: SquareSchema,
  to: SquareSchema,
  promotion: z.enum(["q", "r", "b", "n"]).optional(),
});

const AcceptModeSchema = z.enum(["piece", "square", "arrow", "move"]);

const HintSchema = z.union([SquareSchema, ArrowSchema]);

export const AskOnBoardArgsSchema = z.object({
  fen: FenSchema,
  prompt: z.string().min(1).max(200),
  accept: z.array(AcceptModeSchema).min(1).max(4),
  minTotal: z.number().int().min(1).max(16).optional(),
  maxTotal: z.number().int().min(1).max(16).optional(),
  hint: z.array(HintSchema).max(16).optional(),
});

export const AskOnBoardResultSchema = z.object({
  pieces: z.array(SquareSchema),
  squares: z.array(SquareSchema),
  arrows: z.array(ArrowSchema),
  moves: z.array(MoveSchema),
});

export type AskOnBoardArgs = z.infer<typeof AskOnBoardArgsSchema>;
export type AskOnBoardResult = z.infer<typeof AskOnBoardResultSchema>;
export type AcceptMode = z.infer<typeof AcceptModeSchema>;
export type AnnotationArrow = z.infer<typeof ArrowSchema>;
export type AnnotationMove = z.infer<typeof MoveSchema>;
