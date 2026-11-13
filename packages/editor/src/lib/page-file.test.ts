import { describe, expect, it } from "vitest";
import { countWords } from "./page-file";
import { plainText, readPage, tidyMarkdown, writePage } from "./page-file";

describe("readPage", () => {
  it("reads the title and keeps the other properties as written", () => {
    const page = readPage(
      "---\ntitle: Pilot study plan\ntags: [methods, survey]\nstatus: In progress\n---\n\nBody text.\n",
    );
    expect(page).toEqual({
      title: "Pilot study plan",
      properties: "tags: [methods, survey]\nstatus: In progress",
      markdown: "Body text.\n",
    });
  });

  it("reads a file with no front matter as a body", () => {
    expect(readPage("# Heading\n\nText.")).toEqual({
      title: "",
      properties: "",
      markdown: "# Heading\n\nText.",
    });
  });

  it("reads quoted titles", () => {
    expect(readPage('---\ntitle: "Notes: week 46"\n---\n').title).toBe(
      "Notes: week 46",
    );
    expect(readPage("---\ntitle: 'It''s done'\n---\n").title).toBe("It's done");
  });

  it("leaves a divider at the top of the body alone", () => {
    const source = "Text\n\n---\n\nMore";
    expect(readPage(source).markdown).toBe(source);
  });

  it("reads an empty front matter", () => {
    expect(readPage("---\n---\n\nBody")).toEqual({
      title: "",
      properties: "",
      markdown: "Body",
    });
  });
});

describe("writePage", () => {
  it("writes the title first, then the other properties", () => {
    expect(
      writePage({
        title: "Pilot study plan",
        properties: "status: Draft",
        markdown: "Body.",
      }),
    ).toBe("---\ntitle: Pilot study plan\nstatus: Draft\n---\n\nBody.");
  });

  it("writes no front matter for a page with no properties", () => {
    expect(writePage({ title: "", properties: "", markdown: "Body." })).toBe("Body.");
  });

  for (const title of [
    "Pilot study plan",
    "Notes: week 46",
    'She said "no"',
    "#1 priority",
    " padded ",
    "true",
    "2026",
    "Ends with colon:",
    "Über die Methode",
    "C:\\notes",
  ]) {
    it(`keeps the title ${JSON.stringify(title)} through a write and a read`, () => {
      const page = { title, properties: "tags: [a]", markdown: "Body.\n" };
      expect(readPage(writePage(page))).toEqual(page);
    });
  }
});

describe("plainText", () => {
  it("counts the words of a page, not its syntax", () => {
    const markdown = [
      "## Open tasks",
      "",
      "- [x] Translate the **consent form**, *now*.",
      "- [ ] Book [room B2.14](https://example.com/rooms)",
      "",
      "> [!note]",
      "> Ethics approval came through.",
      "",
      "| Week | Step |",
      "| --- | --- |",
      "| 46 | Print |",
      "",
      "---",
      "",
      "$$",
      "s_i = \\frac{1}{k_i}",
      "$$",
      "",
      "The mean $\\bar{x}$ counts.",
    ].join("\n");
    // Open tasks / Translate the consent form, now. / Book room B2.14 /
    // Ethics approval came through / Week Step / 46 Print /
    // The mean counts
    expect(countWords(plainText(markdown))).toBe(21);
  });
});

describe("tidyMarkdown", () => {
  it("leaves one blank line between blocks and none at the ends", () => {
    expect(tidyMarkdown("\n\nOne\n\n\n\n| a |\n| - |\n\n\nTwo\n\n")).toBe(
      "One\n\n| a |\n| - |\n\nTwo",
    );
  });

  it("keeps the blank lines of a code block", () => {
    const code = "```py\na = 1\n\n\nb = 2\n```";
    expect(tidyMarkdown(`Text\n\n\n${code}\n\n\nMore`)).toBe(`Text\n\n${code}\n\nMore`);
  });

  it("does not close a code block on a shorter fence", () => {
    const code = "````md\n```\n\n\n```\n````";
    expect(tidyMarkdown(code)).toBe(code);
  });
});

describe("plainText and references", () => {
  it("leaves citations and the reference list out of the words", () => {
    const text = plainText(
      "One two [@lee2020, p. 4].\n\n```bibliography\n- key: lee2020\n  title: Many words here\n```",
    );
    expect(text.trim().split(/\s+/)).toEqual(["One", "two", "."]);
  });
});
