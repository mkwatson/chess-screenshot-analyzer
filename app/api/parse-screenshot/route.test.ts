import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock parseScreenshot — the route is a thin wrapper around it.
const parseScreenshotMock = vi.fn<(input: unknown) => Promise<unknown>>();
vi.mock("@/lib/vision/parse-screenshot", () => ({
  parseScreenshot: (input: unknown) => parseScreenshotMock(input),
}));

import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/parse-screenshot", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  parseScreenshotMock.mockReset();
});

describe("POST /api/parse-screenshot", () => {
  it("returns 200 + success body when parseScreenshot succeeds", async () => {
    parseScreenshotMock.mockResolvedValueOnce({
      ok: true,
      data: {
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        sideToMove: "w",
        confidence: 0.9,
      },
    });
    const res = await POST(makeRequest({ imageBase64: "iVBORw==", mimeType: "image/png" }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("returns 400 + failure body when parseScreenshot reports invalid_input", async () => {
    parseScreenshotMock.mockResolvedValueOnce({
      ok: false,
      reason: "invalid_input",
      detail: "Required",
    });
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 502 when parseScreenshot reports vision_error", async () => {
    parseScreenshotMock.mockResolvedValueOnce({
      ok: false,
      reason: "vision_error",
      detail: "Gemini outage",
    });
    const res = await POST(makeRequest({ imageBase64: "iVBORw==", mimeType: "image/png" }));
    expect(res.status).toBe(502);
  });

  it("returns 400 for a non-JSON body", async () => {
    const bad = new Request("http://localhost/api/parse-screenshot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });
});
