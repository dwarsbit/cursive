// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { documentExtensions } from "./extensions";
import { readPage } from "@/lib/page-file";
import { SAMPLE_PAGE, SAMPLE_PROJECT } from "./sample";

function editorFor(markdown: string) {
  return new Editor({
    extensions: documentExtensions(),
    content: markdown,
    contentType: "markdown",
  });
}

const roundTrip = (markdown: string) => editorFor(markdown).getMarkdown().trim();

describe("Markdown round trip", () => {
  const cases: Record<string, string> = {
    paragraph:
      "Plain text with **bold**, *italic*, ~~struck~~, `code` and ==marked== words.",
    headings: "# One\n\n## Two\n\n### Three",
    link: "See [the plan](https://example.com/plan).",
    "bulleted list": "- One\n- Two\n  - Nested\n- Three",
    "numbered list": "1. One\n2. Two\n3. Three",
    "to-do list": "- [x] Done\n- [ ] Not done",
    quote: "> Pilot the timing, not the hypotheses.",
    callout: "> [!note]\n> Ethics approval came through.\n>\n> Quote `ERB-2026-118`.",
    "warning callout": "> [!warning]\n> Check the room booking.",
    toggle:
      "<details open>\n<summary>Why 40 participants?</summary>\n\nEnough to spot items people skip.\n\n- One\n- Two\n\n</details>",
    "closed toggle": "<details>\n<summary>More</summary>\n\nHidden text.\n\n</details>",
    code: "```r\nscore <- function(df) {\n  rowMeans(df, na.rm = TRUE)\n}\n```",
    equation: "$$\ns_i = \\frac{1}{k_i} \\sum_j x_{ij}\n$$",
    "inline math": "The mean $\\bar{x}$ of the items.",
    divider: "Above\n\n---\n\nBelow",
    table: [
      "| Week | Step            |",
      "| ---- | --------------- |",
      "| 46   | Print 50 copies |",
      "| 47   | Pilot session   |",
    ].join("\n"),
  };

  for (const [name, markdown] of Object.entries(cases)) {
    it(`keeps a ${name}`, () => {
      expect(roundTrip(markdown)).toBe(markdown);
    });
  }

  it("reads the blocks as their own nodes", () => {
    const doc = editorFor(
      [cases.callout, cases.toggle, cases["to-do list"], cases.equation].join("\n\n"),
    ).getJSON();
    expect(doc.content?.map((node) => node.type)).toEqual([
      "callout",
      "details",
      "taskList",
      "blockMath",
    ]);
    expect(doc.content?.[0].attrs?.kind).toBe("note");
    expect(doc.content?.[1].attrs?.open).toBe(true);
  });

  it("keeps a toggle inside a toggle", () => {
    const markdown =
      "<details open>\n<summary>Outer</summary>\n\n<details>\n<summary>Inner</summary>\n\nText.\n\n</details>\n\n</details>";
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("writes the sample page the same way twice", () => {
    const sample = readPage(SAMPLE_PROJECT.pages[SAMPLE_PAGE]).markdown;
    const once = editorFor(sample).getMarkdown();
    expect(editorFor(once).getMarkdown()).toBe(once);
    expect(once).toContain("> [!note]");
    expect(once).toContain("<details open>");
    expect(once).toContain("- [x] Translate");
  });

  it("reads a quote that is not a callout as a quote", () => {
    const doc = editorFor("> [!unknown]\n> Text.").getJSON();
    expect(doc.content?.[0].type).toBe("blockquote");
  });
});
