// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { documentExtensions } from "@/editor/extensions";
import { SAMPLE_PROJECT } from "@/editor/sample";
import { readPage } from "@/lib/page-file";
import {
  isPresentation,
  NEW_PRESENTATION,
  pageType,
  readDeck,
  slideTitle,
  splitBlocks,
  writeDeck,
} from "./deck";

const DECK = `\`\`\`slide
layout: title
\`\`\`

Lab meeting

# Pilot study

\`\`\`notes
Keep this short.
\`\`\`

---

## Why

- One
- Two

---

\`\`\`slide
layout: quote
text: small
\`\`\`

> Said so.
`;

describe("a presentation's file", () => {
  it("tells a presentation from a page of notes", () => {
    expect(pageType("tags: [a]\ntype: Presentation")).toBe("presentation");
    expect(pageType('type: "presentation"')).toBe("presentation");
    expect(pageType("subtype: presentation")).toBe("");
    expect(isPresentation(readPage(NEW_PRESENTATION))).toBe(true);
    expect(isPresentation(readPage("---\ntitle: Notes\n---\n\nText"))).toBe(false);
  });

  it("reads the slides between dividers, with their layout and notes", () => {
    expect(readDeck(DECK)).toEqual([
      {
        layout: "title",
        small: false,
        body: "Lab meeting\n\n# Pilot study",
        notes: "Keep this short.",
      },
      { layout: "content", small: false, body: "## Why\n\n- One\n- Two", notes: "" },
      { layout: "quote", small: true, body: "> Said so.", notes: "" },
    ]);
  });

  it("writes the slides as it read them", () => {
    expect(writeDeck(readDeck(DECK))).toBe(DECK);
    const sample = readPage(SAMPLE_PROJECT.pages["Talks/Pilot study results.md"]);
    expect(writeDeck(readDeck(sample.markdown))).toBe(sample.markdown);
  });

  it("starts a new presentation with one title slide", () => {
    expect(readDeck(readPage(NEW_PRESENTATION).markdown)).toEqual([
      { layout: "title", small: false, body: "", notes: "" },
    ]);
  });

  it("keeps a divider inside a code block, and a heading's underline", () => {
    const slides = readDeck("```md\na\n\n---\n\nb\n```\n\nHeading\n---\n\ntext");
    expect(slides).toHaveLength(1);
    expect(slides[0].body).toContain("---\n\nb");
  });

  it("keeps empty slides and blank lines in code", () => {
    const slides = readDeck("One\n\n---\n\n---\n\n```\na\n\n\n\nb\n```");
    expect(slides.map((slide) => slide.body)).toEqual([
      "One",
      "",
      "```\na\n\n\n\nb\n```",
    ]);
    expect(readDeck(writeDeck(slides))).toEqual(slides);
  });

  it("fences notes that hold a fence of their own", () => {
    const slides = [
      {
        layout: "content" as const,
        small: false,
        body: "Text",
        notes: "Say\n```\ncode",
      },
    ];
    expect(readDeck(writeDeck(slides))).toEqual(slides);
  });

  it("names a slide after its heading, or its first words", () => {
    expect(slideTitle(readDeck("Kicker\n\n## The **point**")[0])).toBe("The point");
    expect(slideTitle(readDeck("- [x] First thing")[0])).toBe("First thing");
    expect(slideTitle(readDeck("## Timing^[In minutes.] per item")[0])).toBe(
      "Timing per item",
    );
    expect(slideTitle(readDeck("```r\nx\n```")[0])).toBe("");
  });

  it("shows a slide's settings and notes as code in other tools", () => {
    const editor = new Editor({
      extensions: documentExtensions(),
      content: DECK,
      contentType: "markdown",
    });
    expect(editor.getMarkdown().trim()).toBe(DECK.trim());
  });
});

describe("splitting a slide", () => {
  const text = (value: string) => ({ type: "text", text: value });
  const heading = { type: "heading", attrs: { level: 2 }, content: [text("Items")] };
  const paragraph = (value: string) => ({ type: "paragraph", content: [text(value)] });
  const list = (type: string, items: string[], attrs = {}) => ({
    type,
    attrs,
    content: items.map((item) => ({ type: "listItem", content: [paragraph(item)] })),
  });
  const words = (blocks: ReturnType<typeof splitBlocks>) =>
    blocks?.map((half) =>
      JSON.stringify(half)
        .match(/"text":"[^"]*"/g)
        ?.join(" "),
    );

  it("cuts a long list in two and repeats the heading", () => {
    const halves = splitBlocks([
      heading,
      list("bulletList", ["a", "b", "c", "d", "e"]),
    ]);
    expect(words(halves)).toEqual([
      '"text":"Items" "text":"a" "text":"b" "text":"c"',
      '"text":"Items" "text":" (continued)" "text":"d" "text":"e"',
    ]);
  });

  it("goes on counting in a numbered list", () => {
    const halves = splitBlocks([
      list("orderedList", ["a", "b", "c", "d"], { start: 1 }),
    ]);
    expect(halves?.[1][0].attrs).toEqual({ start: 3 });
  });

  it("cuts between blocks, and inside a list where the middle falls", () => {
    const halves = splitBlocks([
      paragraph("intro"),
      list("bulletList", ["a", "b", "c"]),
      paragraph("outro"),
    ]);
    expect(words(halves)).toEqual([
      '"text":"intro" "text":"a" "text":"b"',
      '"text":"c" "text":"outro"',
    ]);
  });

  it("says continued once", () => {
    const again = { ...heading, content: [text("Items (continued)")] };
    const halves = splitBlocks([again, paragraph("a"), paragraph("b")]);
    expect(words(halves)?.[1]).toBe('"text":"Items (continued)" "text":"b"');
  });

  it("leaves a slide with one block alone", () => {
    expect(splitBlocks([heading, paragraph("only")])).toBeNull();
    expect(splitBlocks([heading])).toBeNull();
  });
});
