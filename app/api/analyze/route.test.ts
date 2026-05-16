import { describe, it, expect } from "vitest";
import { POST } from "./route";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/analyze", () => {
  it("returns a valid analyze result for the starting position", async () => {
    const res = await POST(makeRequest({ fen: STARTING_FEN, depth: 10 }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data?: { bestMove?: string } };
    expect(json.ok).toBe(true);
    expect(json.data?.bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
  }, 30_000);

  it("returns 400 with ok:false for an invalid FEN", async () => {
    const res = await POST(makeRequest({ fen: "not a fen", depth: 10 }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: boolean; reason?: string };
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("invalid_position");
  });

  it("returns 400 for a non-JSON body", async () => {
    const bad = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
  });
});
