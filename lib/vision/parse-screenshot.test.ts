import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ai's generateObject before importing the SUT.
const generateObjectMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateObject: (...args: unknown[]): Promise<unknown> => generateObjectMock(...args),
  };
});

import { parseScreenshot } from "./parse-screenshot";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const ILLEGAL_FEN =
  // Two white kings — clearly illegal
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBKK w KQkq - 0 1";

const VALID_INPUT = {
  imageBase64: "iVBORw0KGgo=",
  mimeType: "image/png" as const,
};

beforeEach(() => {
  generateObjectMock.mockReset();
});

describe("parseScreenshot", () => {
  it("returns ok:true on a legal-FEN parse", async () => {
    generateObjectMock.mockResolvedValueOnce({
      object: { fen: STARTING_FEN, sideToMove: "w", confidence: 0.95 },
    });
    const result = await parseScreenshot(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.fen).toBe(STARTING_FEN);
      expect(result.data.confidence).toBe(0.95);
    }
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on illegal position then succeeds", async () => {
    generateObjectMock
      .mockResolvedValueOnce({
        object: { fen: ILLEGAL_FEN, sideToMove: "w", confidence: 0.9 },
      })
      .mockResolvedValueOnce({
        object: { fen: STARTING_FEN, sideToMove: "w", confidence: 0.92 },
      });
    const result = await parseScreenshot(VALID_INPUT);
    expect(result.ok).toBe(true);
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("returns ok:false illegal_position when retry also fails", async () => {
    generateObjectMock
      .mockResolvedValueOnce({
        object: { fen: ILLEGAL_FEN, sideToMove: "w", confidence: 0.9 },
      })
      .mockResolvedValueOnce({
        object: { fen: ILLEGAL_FEN, sideToMove: "w", confidence: 0.5 },
      });
    const result = await parseScreenshot(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("illegal_position");
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("returns ok:false invalid_input on a bad input shape", async () => {
    const result = await parseScreenshot({
      imageBase64: "",
      mimeType: "image/png",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_input");
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("returns ok:false vision_error if generateObject throws", async () => {
    generateObjectMock.mockRejectedValueOnce(new Error("Gemini outage"));
    const result = await parseScreenshot(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("vision_error");
  });
});
