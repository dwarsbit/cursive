import { describe, expect, it } from "vitest";
import { matchesIn } from "./find";
import { lineWords, searchProject } from "./search";

const page = (title: string, body: string) => `---\ntitle: ${title}\n---\n\n${body}\n`;

describe("searchProject", () => {
  const pages = {
    "Thesis/Pilot study plan.md": page("Pilot study plan", "We run the **pilot** with 40 students.\n\nThe pilot is short."),
    "Notes/Café.md": page("Café", "Met at the café to plan the [[Pilot study plan|pilot]]."),
    "Notes/Other.md": page("Other", "| Week | Step |\n| --- | --- |\n| 47 | Pilot session |"),
  };

  it("puts pages whose title matches first, then the ones that match most", () => {
    const results = searchProject(pages, "pilot");
    expect(results.map((result) => result.path)).toEqual([
      "Thesis/Pilot study plan.md",
      "Notes/Café.md",
      "Notes/Other.md",
    ]);
    expect(results[0]).toMatchObject({ inTitle: true, count: 2 });
  });

  it("shows the text as the page does, without its Markdown", () => {
    const [result] = searchProject(pages, "40 students");
    expect(result.excerpts[0]).toEqual({ before: "We run the pilot with ", match: "40 students", after: "." });
    expect(searchProject(pages, "session")[0].excerpts[0].before).toBe("47 · Pilot ");
  });

  it("leaves case and accents aside", () => {
    expect(searchProject(pages, "CAFE").map((result) => result.path)).toEqual(["Notes/Café.md"]);
    expect(searchProject(pages, "cafe")[0].excerpts[0].match).toBe("café");
  });

  it("finds nothing for an empty query", () => {
    expect(searchProject(pages, "  ")).toEqual([]);
  });
});

describe("lineWords", () => {
  it("takes out the syntax", () => {
    expect(lineWords("- [x] See [[Plan|the plan]] and ![chart](a.png) **now**")).toBe(
      "See the plan and chart now",
    );
    expect(lineWords("> [!note] Read [this](https://example.com)")).toBe("Read this");
  });
});

describe("matchesIn", () => {
  it("finds every place, with or without case", () => {
    expect(matchesIn("The theme of the day", { text: "the", caseSensitive: false })).toEqual([
      [0, 3],
      [4, 7],
      [13, 16],
    ]);
    expect(matchesIn("The theme", { text: "The", caseSensitive: true })).toEqual([[0, 3]]);
    expect(matchesIn("aaa", { text: "", caseSensitive: false })).toEqual([]);
  });
});
