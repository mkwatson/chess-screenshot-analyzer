// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Board } from "./board";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("Board", () => {
  it("renders without crashing for the starting position", () => {
    const { container } = render(<Board fen={STARTING_FEN} />);
    expect(container.querySelector(".cg-wrap")).not.toBeNull();
  });

  it("accepts arrows prop without crashing", () => {
    const { container } = render(
      <Board fen={STARTING_FEN} arrows={[{ orig: "e2", dest: "e4", brush: "green" }]} />,
    );
    expect(container.querySelector(".cg-wrap")).not.toBeNull();
  });
});
