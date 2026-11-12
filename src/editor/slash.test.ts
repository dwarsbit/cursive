// @vitest-environment happy-dom
import { Editor, type JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { BLOCKS } from "./blocks";
import { documentExtensions } from "./extensions";
import { insertBlock } from "./slash";

/** An editor with "/query" typed on a line of its own, and its range. */
function typed(query: string) {
  const editor = new Editor({
    extensions: documentExtensions(),
    content: `Before\n\n/${query}`,
    contentType: "markdown",
  });
  const end = editor.state.doc.content.size - 1;
  // The caret is right after what was typed, as it is in the menu.
  editor.commands.setTextSelection(end);
  return { editor, range: { from: end - query.length - 1, to: end } };
}

/** The block each item leaves under the first paragraph. */
const EXPECTED: Record<string, string> = {
  text: "paragraph",
  "heading-1": "heading",
  "heading-2": "heading",
  "heading-3": "heading",
  "to-do": "taskList",
  "bulleted-list": "bulletList",
  "numbered-list": "orderedList",
  toggle: "details",
  quote: "blockquote",
  callout: "callout",
  table: "table",
  code: "codeBlock",
  equation: "blockMath",
  divider: "horizontalRule",
  goals: "goals",
  terms: "terms",
  video: "video",
  compare: "compare",
  quiz: "quiz",
  blanks: "blanks",
  order: "order",
  exercise: "exercise",
  flashcards: "flashcards",
  assignment: "assignment",
};

describe("insertBlock", () => {
  for (const block of BLOCKS) {
    it(`puts a ${block.title} in place of the typed slash`, () => {
      const { editor, range } = typed("x");
      insertBlock(editor, range, block);
      const [first, second] = editor.getJSON().content ?? [];
      expect(editor.getText()).not.toContain("/x");
      expect(first.type).toBe("paragraph");
      expect(second.type).toBe(EXPECTED[block.id]);
    });
  }

  it("writes the new blocks as Markdown", () => {
    const written = (id: string) => {
      const { editor, range } = typed("x");
      insertBlock(
        editor,
        range,
        BLOCKS.find((item) => item.id === id)!,
      );
      return editor.getMarkdown().trim();
    };
    expect(written("to-do")).toBe("Before\n\n- [ ]");
    expect(written("callout")).toBe("Before\n\n> [!note]\n>");
    expect(written("divider")).toBe("Before\n\n---");
    expect(written("toggle")).toContain("<details open>\n<summary></summary>");
  });

  it("puts a table with a header row in place of the typed slash", () => {
    const { editor, range } = typed("table");
    insertBlock(
      editor,
      range,
      BLOCKS.find((item) => item.id === "table")!,
    );
    const doc: JSONContent = editor.getJSON();
    const table = doc.content?.find((node) => node.type === "table");
    const rows: JSONContent[] = table?.content ?? [];
    expect(rows).toHaveLength(3);
    expect(rows[0].content?.map((cell: JSONContent) => cell.type)).toEqual([
      "tableHeader",
      "tableHeader",
      "tableHeader",
    ]);
    expect(editor.getText()).not.toContain("/table");
  });

  it("makes an empty equation, which the editor opens for writing", () => {
    const { editor, range } = typed("equ");
    insertBlock(
      editor,
      range,
      BLOCKS.find((item) => item.id === "equation")!,
    );
    const math = editor.getJSON().content?.find((node) => node.type === "blockMath");
    expect(math?.attrs?.latex).toBe("");
  });
});
