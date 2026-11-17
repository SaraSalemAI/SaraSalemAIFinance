// Prepared by Sara Salem. Copyright (c) Sara Salem 2026.
import { describe, expect, it } from "vitest";
import { ConsoleBuilder } from "../src/builder";
import { formatCompact } from "../src/widgets";

describe("enhancements", () => {
  it("skips an alias that collides with a real command instead of crashing", () => {
    const b = new ConsoleBuilder("t")
      .command({ path: ["steps"], summary: "steps", run: () => {} })
      .command({ path: ["start"], summary: "start", aliases: ["steps", "go", "GO"], run: () => {} });
    const paths = b.build().commands().map((c) => c.path.join(" "));
    expect(paths).toContain("steps");
    expect(paths).toContain("start");
  });
  it("still rejects two real commands with the same name", () => {
    const b = new ConsoleBuilder("t").command({ path: ["x"], summary: "", run: () => {} });
    expect(() => b.command({ path: ["x"], summary: "", run: () => {} })).toThrow(/defined twice/);
  });
  it("formats compact axis numbers", () => {
    expect(formatCompact({}, 950)).toBe("950");
    expect(formatCompact({}, 1250)).toBe("1.3K");
    expect(formatCompact({ prefix: "$" }, 2_500_000)).toBe("$2.5M");
    expect(formatCompact({}, 3e9)).toBe("3B");
  });
});
