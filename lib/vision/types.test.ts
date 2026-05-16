import { describe, it, expect } from "vitest";
import { ParseInputSchema, ParseOutputSchema } from "./types";

describe("ParseInputSchema", () => {
  it("accepts a valid base64-encoded image input", () => {
    const input = {
      imageBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      mimeType: "image/png" as const,
    };
    expect(ParseInputSchema.parse(input)).toEqual(input);
  });

  it("accepts jpeg", () => {
    const input = {
      imageBase64: "data".repeat(10),
      mimeType: "image/jpeg" as const,
    };
    expect(ParseInputSchema.parse(input)).toEqual(input);
  });

  it("rejects unsupported mime types", () => {
    expect(() =>
      ParseInputSchema.parse({
        imageBase64: "data",
        mimeType: "image/gif",
      }),
    ).toThrow();
  });

  it("rejects empty image data", () => {
    expect(() => ParseInputSchema.parse({ imageBase64: "", mimeType: "image/png" })).toThrow();
  });

  it("rejects images larger than the cap", () => {
    // The schema imposes a max-size cap (in base64-encoded chars) to prevent
    // accidental gigabyte payloads. Default cap is generous (~8MB encoded).
    const tooBig = "A".repeat(20 * 1024 * 1024);
    expect(() => ParseInputSchema.parse({ imageBase64: tooBig, mimeType: "image/png" })).toThrow();
  });
});

describe("ParseOutputSchema", () => {
  it("accepts a success result", () => {
    const result = {
      ok: true as const,
      data: {
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        sideToMove: "w" as const,
        confidence: 0.95,
      },
    };
    expect(ParseOutputSchema.parse(result)).toEqual(result);
  });

  it("accepts a failure result", () => {
    const result = {
      ok: false as const,
      reason: "illegal_position" as const,
      detail: "Two white kings",
    };
    expect(ParseOutputSchema.parse(result)).toEqual(result);
  });

  it("rejects success result with confidence > 1", () => {
    expect(() =>
      ParseOutputSchema.parse({
        ok: true,
        data: {
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          sideToMove: "w",
          confidence: 1.5,
        },
      }),
    ).toThrow();
  });
});
