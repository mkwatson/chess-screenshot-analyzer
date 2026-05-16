#!/usr/bin/env python3
"""
Eval Gemini vision on a known chess board image across model x thinkingLevel x
output-shape combinations. Compares predicted FEN to ground truth and reports
per-square diffs.

Run:    python3 scripts/test-vision.py
Reads:  test_board.jpg  +  GOOGLE_GENERATIVE_AI_API_KEY from .env.local
"""

import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_PATH = os.path.join(ROOT, "test_board.jpg")
ENV_PATH = os.path.join(ROOT, ".env.local")
TRUTH = "r1b1kbnr/pppp1ppp/2n5/3Pp1B1/1q2P3/2N2N2/PPP2PPP/R2QKB1R w KQkq - 1 2"
TRUTH_BOARD = TRUTH.split(" ", 1)[0]

# Read API key from .env.local (never log it)
def load_key() -> str:
    for line in open(ENV_PATH):
        if line.startswith("GOOGLE_GENERATIVE_AI_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("API key not found in .env.local")


KEY = load_key()
IMG_B64 = base64.b64encode(open(IMG_PATH, "rb").read()).decode()

SYSTEM = (
    "You are a chess board image parser. Given an image of a chess position, "
    "identify the piece on every square. Use these letters: P/N/B/R/Q/K for "
    "white pieces, p/n/b/r/q/k for black pieces."
)

# Two output shapes:
# 1. "fen" — model returns the FEN string directly
# 2. "grid" — model returns an 8x8 array; we construct the FEN server-side

GRID_SCHEMA = {
    "type": "object",
    "properties": {
        "board": {
            "type": "array",
            "minItems": 8,
            "maxItems": 8,
            "items": {
                "type": "array",
                "minItems": 8,
                "maxItems": 8,
                "items": {"type": "string"},  # "" or one of pnbrqkPNBRQK
            },
        },
        "sideToMove": {"type": "string", "enum": ["w", "b"]},
        "castling": {"type": "string"},
        "enPassant": {"type": "string"},
    },
    "required": ["board", "sideToMove", "castling", "enPassant"],
    "propertyOrdering": ["board", "sideToMove", "castling", "enPassant"],
}


def grid_to_fen(obj) -> str:
    """Convert {board: 8x8, sideToMove, castling, enPassant} → FEN.
    Board is rank 8 first (top of array), rank 1 last."""
    ranks = []
    for row in obj["board"]:
        s = ""
        empty = 0
        for cell in row:
            if not cell or cell == " " or cell == ".":
                empty += 1
            else:
                if empty:
                    s += str(empty)
                    empty = 0
                s += cell
        if empty:
            s += str(empty)
        ranks.append(s)
    fen = "/".join(ranks)
    return (
        f"{fen} {obj['sideToMove']} {obj['castling'] or '-'} "
        f"{obj.get('enPassant') or '-'} 0 1"
    )


def call_gemini(model: str, thinking_level: str, shape: str) -> tuple[str, int, str]:
    """Returns (predicted_fen, ms_elapsed, raw_text_for_debug)."""
    user_text = (
        "Return ONLY the FEN string. No prose, no markdown, no quotes. "
        "Standard 6-field format: pieces / side / castling / enPassant / "
        "halfmove / fullmove."
        if shape == "fen"
        else (
            "Identify the piece on every square. Return a JSON object matching "
            "the response schema: 8x8 'board' (rank 8 first, file a first); "
            "empty squares as empty string."
        )
    )

    gen_config: dict = {
        "thinkingConfig": {"thinkingLevel": thinking_level},
        "mediaResolution": "MEDIA_RESOLUTION_HIGH",
        "maxOutputTokens": 4000,
        "temperature": 0.1,
    }
    if shape == "grid":
        gen_config["responseMimeType"] = "application/json"
        gen_config["responseSchema"] = GRID_SCHEMA

    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"inlineData": {"mimeType": "image/jpeg", "data": IMG_B64}},
                    {"text": user_text},
                ],
            }
        ],
        "generationConfig": gen_config,
    }

    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-goog-api-key": KEY},
        method="POST",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return (f"HTTP {e.code}: {e.read().decode()[:200]}", int((time.time() - t0) * 1000), "")
    except Exception as e:
        return (f"ERR: {e}", int((time.time() - t0) * 1000), "")
    ms = int((time.time() - t0) * 1000)

    cands = data.get("candidates", [])
    if not cands:
        return (f"NO_CANDIDATES: {json.dumps(data)[:200]}", ms, "")
    text = "".join(p.get("text", "") for p in cands[0].get("content", {}).get("parts", [])).strip()
    if not text:
        return (f"EMPTY: finishReason={cands[0].get('finishReason')}", ms, "")

    if shape == "fen":
        # Strip code fences / "FEN:" prefixes if model included them
        m = re.search(r"[rnbqkpRNBQKP1-8/]+ [wb] \S+ \S+ \d+ \d+", text)
        return (m.group(0) if m else text, ms, text)
    else:
        try:
            obj = json.loads(text)
            return (grid_to_fen(obj), ms, text)
        except Exception as e:
            return (f"GRID_PARSE_FAIL: {e}", ms, text[:200])


def board_diff(pred: str, truth: str) -> str:
    """Compare two board portions (the first FEN field). Returns short report."""
    if pred == truth:
        return "exact"
    # Expand each into 64 cells for per-square compare
    def expand(b: str) -> list[str]:
        cells = []
        for ch in b.replace("/", ""):
            if ch.isdigit():
                cells.extend([""] * int(ch))
            else:
                cells.append(ch)
        return cells
    pe, te = expand(pred), expand(truth)
    if len(pe) != 64 or len(te) != 64:
        return f"length-mismatch (pred={len(pe)}, truth={len(te)})"
    wrong = sum(1 for a, b in zip(pe, te) if a != b)
    return f"{wrong}/64 squares wrong"


def status(pred_fen: str) -> str:
    if pred_fen.startswith(("HTTP", "ERR", "NO_", "EMPTY", "GRID_")):
        return f"⚠️  {pred_fen[:80]}"
    if pred_fen == TRUTH:
        return "✅ exact"
    pred_board = pred_fen.split(" ", 1)[0]
    if pred_board == TRUTH_BOARD:
        return "🟡 board exact (meta differs)"
    return f"❌ {board_diff(pred_board, TRUTH_BOARD)}"


def main() -> None:
    # Argv: optional --trials N (default 3) and optional --quick (only run the
    # configurations we care about most, not the full matrix).
    trials = 3
    quick = False
    args = sys.argv[1:]
    while args:
        a = args.pop(0)
        if a == "--trials":
            trials = int(args.pop(0))
        elif a == "--quick":
            quick = True

    # Full matrix vs. focused matrix. Focused = grid-only (we already know
    # fen-string shape underperforms), all thinking levels.
    if quick:
        combos = [
            ("gemini-3.1-flash-lite", "low", "grid"),
            ("gemini-3.1-pro-preview", "low", "grid"),
            ("gemini-3.1-pro-preview", "medium", "grid"),
            ("gemini-3.1-pro-preview", "high", "grid"),
        ]
    else:
        combos = [
            (m, tl, sh)
            for sh in ("fen", "grid")
            for m in ("gemini-3.1-flash-lite", "gemini-3.1-pro-preview")
            for tl in ("minimal", "low", "medium", "high")
        ]

    print(f"TRUTH: {TRUTH}\n")
    print(f"Running {len(combos)} configurations × {trials} trial(s) each\n")
    print(f"{'model':<28} {'think':<8} {'shape':<6} {'trial':<5} {'ms':>6}  result")
    print("-" * 100)

    # Aggregate stats per (model, thinking, shape).
    summary: dict[tuple[str, str, str], dict] = {}

    for model, tl, sh in combos:
        rec = summary.setdefault((model, tl, sh), {"exact": 0, "board_exact": 0, "wrong": 0, "err": 0, "ms": []})
        for trial in range(1, trials + 1):
            fen, ms, _ = call_gemini(model, tl, sh)
            print(f"{model:<28} {tl:<8} {sh:<6} {trial:<5} {ms:>6}  {status(fen)}")
            if fen.startswith(("HTTP", "ERR", "NO_", "EMPTY", "GRID_")):
                rec["err"] += 1
            elif fen == TRUTH:
                rec["exact"] += 1
                rec["ms"].append(ms)
            elif fen.split(" ", 1)[0] == TRUTH_BOARD:
                rec["board_exact"] += 1
                rec["ms"].append(ms)
            else:
                rec["wrong"] += 1
                rec["ms"].append(ms)
            # Brief cooldown to avoid per-minute caps
            time.sleep(1.5)

    # Summary
    print()
    print("=" * 100)
    print("SUMMARY (per configuration, across all trials):")
    print(f"{'model':<28} {'think':<8} {'shape':<6} {'ok':<7} {'board':<7} {'wrong':<7} {'err':<5} {'avg_ms':>7}")
    print("-" * 100)
    for (model, tl, sh), rec in summary.items():
        n = trials
        avg = int(sum(rec["ms"]) / len(rec["ms"])) if rec["ms"] else 0
        print(
            f"{model:<28} {tl:<8} {sh:<6} "
            f"{rec['exact']}/{n}     "
            f"{rec['board_exact']}/{n}     "
            f"{rec['wrong']}/{n}     "
            f"{rec['err']}/{n}   "
            f"{avg:>7}"
        )


if __name__ == "__main__":
    main()
