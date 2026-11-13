import { describe, expect, it } from "vitest";
import { diffCount, diffLines } from "./diff";

describe("diffLines", () => {
  it("finds no change in the same text", () => {
    const lines = diffLines("a\nb", "a\nb");
    expect(lines.every((line) => line.kind === "same")).toBe(true);
  });

  it("finds lines removed, added and changed", () => {
    expect(diffLines("one\ntwo\nthree\nfour", "one\n2\nthree\nfour\nfive")).toEqual([
      { kind: "same", text: "one" },
      { kind: "removed", text: "two" },
      { kind: "added", text: "2" },
      { kind: "same", text: "three" },
      { kind: "same", text: "four" },
      { kind: "added", text: "five" },
    ]);
  });

  it("keeps the lines both share in the middle", () => {
    const lines = diffLines("x\na\nb\nc\ny", "z\na\nb\nc\nw");
    expect(lines.filter((line) => line.kind === "same").map((line) => line.text)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(diffCount(lines)).toEqual({ added: 2, removed: 2 });
  });

  it("compares an empty text", () => {
    expect(diffCount(diffLines("", "a\nb"))).toEqual({ added: 2, removed: 1 });
  });
});
