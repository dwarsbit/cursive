import { describe, expect, it } from "vitest";
import { BLOCKS, filterBlocks } from "./blocks";

const titles = (query: string) => filterBlocks(query).map((block) => block.title);

describe("filterBlocks", () => {
  it("lists every block for an empty query", () => {
    expect(filterBlocks("")).toEqual(BLOCKS);
  });

  it("puts titles that start with the query first", () => {
    expect(titles("t")).toEqual([
      "Text",
      "To-do list",
      "Toggle",
      "Table",
      "Link to page",
      "Key terms",
      "Fill in the blanks",
      "Heading 1",
      "Callout",
      "Equation",
      "Learning goals",
      "Video",
      "Before and after",
      "Quiz",
      "Put in order",
      "Exercise",
      "Flashcards",
      "Assignment",
    ]);
  });

  it("matches keywords", () => {
    expect(titles("math")).toEqual(["Equation"]);
    expect(titles("todo")).toEqual(["To-do list"]);
  });

  it("matches a later word of the title", () => {
    expect(titles("list")).toEqual(["To-do list", "Bulleted list", "Numbered list"]);
  });

  it("ignores case and returns nothing for no match", () => {
    expect(titles("HEADING 2")).toEqual(["Heading 2"]);
    expect(titles("zzz")).toEqual([]);
  });

  it("gives every block a unique id", () => {
    expect(new Set(BLOCKS.map((block) => block.id)).size).toBe(BLOCKS.length);
  });
});
