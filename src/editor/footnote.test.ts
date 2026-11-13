import { describe, expect, it } from "vitest";
import { inlineNumberedNotes, matchFootnote, writeFootnote } from "./footnote";

describe("footnotes in Markdown", () => {
  it("reads a note up to its closing bracket", () => {
    expect(matchFootnote("^[A note.] and more")).toEqual({
      raw: "^[A note.]",
      text: "A note.",
    });
  });

  it("reads brackets inside a note", () => {
    const src = "^[See [the site](https://example.com) and [@lee2020, p. 4].] after";
    expect(matchFootnote(src)?.text).toBe(
      "See [the site](https://example.com) and [@lee2020, p. 4].",
    );
  });

  it("skips an escaped bracket and a bracket in code", () => {
    expect(matchFootnote("^[A \\] bracket] x")?.text).toBe("A \\] bracket");
    expect(matchFootnote("^[Use `a]` here] x")?.text).toBe("Use `a]` here");
  });

  it("joins the lines of a note and stops at a blank line", () => {
    expect(matchFootnote("^[One\ntwo] x")?.text).toBe("One two");
    expect(matchFootnote("^[One\n\ntwo] x")).toBeNull();
  });

  it("is no note without text or without an end", () => {
    expect(matchFootnote("^[]")).toBeNull();
    expect(matchFootnote("^[ ]")).toBeNull();
    expect(matchFootnote("^[open")).toBeNull();
    expect(matchFootnote("[^1]")).toBeNull();
  });

  it("writes a note, escaping a bracket without a partner", () => {
    expect(writeFootnote("A note.")).toBe("^[A note.]");
    expect(writeFootnote("  ")).toBe("");
    expect(writeFootnote("a ] b")).toBe("^[a \\] b]");
    expect(writeFootnote("a [ b")).toBe("^[a \\[ b]");
    expect(writeFootnote("ends in \\")).toBe("^[ends in \\\\]");
    for (const text of ["a ] b", "a [ b", "[a] ]", "`]` [x]"]) {
      const written = writeFootnote(text);
      expect(matchFootnote(written)?.raw).toBe(written);
    }
  });
});

describe("numbered notes", () => {
  it("become inline notes", () => {
    const markdown = [
      "The sample was small.[^1] A larger study is planned.[^plan]",
      "",
      "[^1]: Twelve students.",
      "[^plan]: See [@lee2020].",
      "",
      "The end.",
    ].join("\n");
    expect(inlineNumberedNotes(markdown)).toBe(
      [
        "The sample was small.^[Twelve students.] A larger study is planned.^[See [@lee2020].]",
        "",
        "The end.",
      ].join("\n"),
    );
  });

  it("join a note written over several lines", () => {
    expect(inlineNumberedNotes("Small.[^1]\n\n[^1]: Twelve\n    students.")).toBe(
      "Small.^[Twelve students.]",
    );
  });

  it("leave a note of several paragraphs as it is written", () => {
    const markdown = "Small.[^1]\n\n[^1]: Twelve students.\n\n    And more.";
    expect(inlineNumberedNotes(markdown)).toBe(markdown);
  });

  it("leave code, unknown labels and unused notes alone", () => {
    const markdown = [
      "Use `[^1]` and [^2].",
      "",
      "```",
      "[^1]: not a note",
      "```",
      "",
      "[^1]: Never used.",
    ].join("\n");
    expect(inlineNumberedNotes(markdown)).toBe(markdown);
  });

  it("leave a page without numbered notes untouched", () => {
    const markdown = "Small.^[Twelve students.]\n\n\n\nMore.";
    expect(inlineNumberedNotes(markdown)).toBe(markdown);
  });
});
