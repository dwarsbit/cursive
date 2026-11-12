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
    quiz: [
      "```quiz",
      "id: q1",
      "question: Which question is double-barrelled?",
      "options:",
      "  - How many hours a week do you study?",
      "  - Was the lecture clear and well paced?",
      "answer: 2",
      "points: 2",
      "attempts: 2",
      "explanation: It asks about two things at once.",
      "```",
    ].join("\n"),
    "quiz as it was typed":
      '```quiz\n# my note\nquestion: "Why?"\noptions: [Yes, No]\nanswer: [1]\n```',
    assignment: [
      "```assignment",
      "id: a1",
      "title: Write five items",
      "instructions: |-",
      "  Write five items for a survey.",
      "",
      "  Add one sentence on what each measures.",
      "points: 10",
      "due: 2026-11-25",
      "```",
    ].join("\n"),
    "assignment with a rubric":
      "```assignment\nid: a2\ntitle: Plan your pilot\ninstructions: One page.\npoints: 5\nrubric:\n  - criterion: Each item asks about one thing\n    points: 3\n  - criterion: No leading wording\n    points: 2\nfiles: true\n```",
    "learning goals":
      "```goals\nitems:\n  - Spot double-barrelled questions\n  - Rewrite a vague item\n```",
    "key terms":
      "```terms\nterms:\n  - term: Pilot study\n    definition: A small trial run of a survey.\n```",
    video:
      "```video\nurl: https://youtu.be/dQw4w9WgXcQ\ntitle: Spotting double-barrelled questions\n```",
    "before and after":
      "```compare\nbefore: How satisfied are you with the content and the teaching?\nafter: |-\n  How satisfied are you with the content?\n\n  How satisfied are you with the teaching?\n```",
    "fill in the blanks":
      "```blanks\nid: b1\ntext: A question that pushes toward one answer is a {{leading}} question.\n```",
    "put in order":
      "```order\nid: o1\nprompt: Put the steps in order\nitems:\n  - Draft the items\n  - Run a pilot\n  - Field the survey\n```",
    exercise:
      "```exercise\nid: e1\nprompt: Rewrite “Do you exercise regularly?”\nhint: What counts as regularly?\nanswer: In the past seven days, on how many days did you exercise?\n```",
    flashcards:
      "```flashcards\ncards:\n  - front: Recall period\n    back: The stretch of time a question asks about.\n```",
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

  it("reads the tutorial blocks as their own nodes", () => {
    const doc = editorFor([cases.quiz, cases.assignment].join("\n\n")).getJSON();
    expect(doc.content?.map((node) => node.type)).toEqual(["quiz", "assignment"]);
    const more = editorFor(
      [
        cases["learning goals"],
        cases["key terms"],
        cases.video,
        cases["before and after"],
        cases["fill in the blanks"],
        cases["put in order"],
        cases.exercise,
        cases.flashcards,
      ].join("\n\n"),
    ).getJSON();
    expect(more.content?.map((node) => node.type)).toEqual([
      "goals",
      "terms",
      "video",
      "compare",
      "blanks",
      "order",
      "exercise",
      "flashcards",
    ]);
  });

  it("keeps a fence named like a tutorial block as code when it isn't one", () => {
    const markdown = "```order\nSELECT * FROM t ORDER BY 1\n```";
    expect(editorFor(markdown).getJSON().content?.[0].type).toBe("codeBlock");
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("keeps a quiz fence that isn't a quiz as code", () => {
    const markdown = "```quiz\n- only\n- a list\n```";
    expect(editorFor(markdown).getJSON().content?.[0].type).toBe("codeBlock");
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("reads a quote that is not a callout as a quote", () => {
    const doc = editorFor("> [!unknown]\n> Text.").getJSON();
    expect(doc.content?.[0].type).toBe("blockquote");
  });
});
