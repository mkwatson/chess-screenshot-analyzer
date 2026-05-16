import { describe, it, expect } from "vitest";
import { ParseInputSchema } from "./types";

// Two tests, each guarding an explicit intent that the type system alone
// doesn't (the specific allowed mime types, and the size cap that protects
// against accidental gigabyte payloads). All "does Zod work" coverage is
// the type system's job; we don't re-assert it here.
describe("ParseInputSchema", () => {
  it("restricts mime type to the chess-friendly image formats", () => {
    expect(() => ParseInputSchema.parse({ imageBase64: "data", mimeType: "image/gif" })).toThrow();
  });

  it("rejects oversized base64 payloads (DoS guard)", () => {
    const tooBig = "A".repeat(20 * 1024 * 1024);
    expect(() => ParseInputSchema.parse({ imageBase64: tooBig, mimeType: "image/png" })).toThrow();
  });
});
