import { mergeAttributes, Node, type CommandProps, type Editor } from "@tiptap/core";
import { BlockMath } from "@tiptap/extension-mathematics";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Numbered figures, tables and equations, written as Quarto and
 * pandoc-crossref write them, so the page reads the same there:
 *
 *     ![Scores per week](attachments/scores.png){#fig-scores}
 *
 *     : Steps of the pilot {#tbl-steps}
 *
 *     $$
 *     E = mc^2
 *     $$ {#eq-energy}
 *
 *     As @fig-scores shows, ...
 *
 * The file holds the ids, never the numbers: the page counts each kind
 * in the order it has them, and a cross-reference shows "Figure 2".
 * The server numbers them the same way when it publishes a site
 * (dwarsbit/polemic-server, apps/api/src/sites/numbering.ts).
 */
export type TargetKind = "fig" | "tbl" | "eq";

export const TARGET_KINDS: TargetKind[] = ["fig", "tbl", "eq"];

const KIND_NAME: Record<TargetKind, string> = {
  fig: "Figure",
  tbl: "Table",
  eq: "Equation",
};

/** An id as the file writes it, after `#` or `@`: `fig-scores`. */
export const TARGET_ID = /^(fig|tbl|eq)-[\w-]*\w$/;
const ID_SOURCE = "(?:fig|tbl|eq)-[\\w-]*\\w";

export const kindOf = (id: string): TargetKind | null =>
  TARGET_ID.test(id) ? (id.slice(0, id.indexOf("-")) as TargetKind) : null;

/** What a reference to a target says: "Figure 2", "Table 1", "Equation 3". */
export const targetLabel = (kind: TargetKind, number: number): string =>
  `${KIND_NAME[kind]} ${number}`;

export interface Target {
  id: string;
  kind: TargetKind;
  number: number;
  /** "Figure 2". */
  label: string;
  /** The caption, or an equation's TeX. */
  caption: string;
}

const NODE_KIND: Record<string, TargetKind> = {
  image: "fig",
  tableCaption: "tbl",
  blockMath: "eq",
};

/** The node's id when it is a numbered figure, table or equation. */
function targetId(node: ProseNode): { id: string; kind: TargetKind } | null {
  const kind = NODE_KIND[node.type.name];
  const id = (node.attrs.id as string | undefined) ?? "";
  return kind && kindOf(id) === kind ? { id, kind } : null;
}

/** The page's figures, tables and equations, each kind counted in the order the page has them. */
export function numberTargets(doc: ProseNode): Map<string, Target> {
  const counts: Record<TargetKind, number> = { fig: 0, tbl: 0, eq: 0 };
  const targets = new Map<string, Target>();
  doc.descendants((node) => {
    const found = targetId(node);
    if (found && !targets.has(found.id)) {
      const number = ++counts[found.kind];
      targets.set(found.id, {
        ...found,
        number,
        label: targetLabel(found.kind, number),
        caption:
          node.type.name === "image"
            ? String(node.attrs.alt ?? "")
            : node.type.name === "blockMath"
              ? String(node.attrs.latex ?? "")
              : node.textContent,
      });
    }
    return !node.isTextblock;
  });
  return targets;
}

/** A new id for a target, from a few of its words, that the page doesn't have yet. */
export function newTargetId(
  kind: TargetKind,
  words: string,
  taken: Iterable<string>,
): string {
  const used = new Set(taken);
  const slug = words
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (word) => word && !["a", "an", "the", "of", "and", "in", "per"].includes(word),
    )
    .slice(0, 3)
    .join("-");
  if (slug && !used.has(`${kind}-${slug}`)) return `${kind}-${slug}`;
  const base = slug ? `${kind}-${slug}-` : `${kind}-`;
  for (let n = slug ? 2 : 1; ; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
}

// ---------- Numbering in the editor ----------

export const numberingKey = new PluginKey<Map<string, Target>>("numbering");

/** The numbers of the page in the editor. */
export const numberingOf = (state: EditorState): Map<string, Target> =>
  numberingKey.getState(state) ?? new Map();

function decorations(doc: ProseNode, targets: Map<string, Target>): DecorationSet {
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "crossRef") {
      const target = targets.get(node.attrs.target as string);
      found.push(
        Decoration.node(pos, pos + node.nodeSize, {
          "data-label": target?.label ?? `@${node.attrs.target as string}`,
          class: target ? "crossref" : "crossref crossref-missing",
          title: target
            ? target.caption
            : "The page has no figure, table or equation with this id.",
        }),
      );
      return false;
    }
    const id = targetId(node);
    const target = id && targets.get(id.id);
    if (target) {
      found.push(
        Decoration.node(pos, pos + node.nodeSize, {
          "data-number":
            target.kind === "eq" ? `(${target.number})` : `${target.label}.`,
        }),
      );
    }
    return true;
  });
  return DecorationSet.create(doc, found);
}

// ---------- Cross-references ----------

/** The cross-reference at the start of `src`: `@fig-scores`. */
export function matchCrossRef(src: string): { raw: string; target: string } | null {
  const found = new RegExp(`^@(${ID_SOURCE})`).exec(src);
  return found ? { raw: found[0], target: found[1] } : null;
}

/**
 * A reference to a figure, table or equation of the page: `@fig-scores`,
 * shown as "Figure 2". It carries the numbering of the page.
 */
export const CrossRef = Node.create({
  name: "crossRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-target") ?? "",
        renderHTML: (attrs) => ({ "data-target": attrs.target as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-target]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes)];
  },

  renderText({ node }) {
    return `@${node.attrs.target as string}`;
  },

  markdownTokenizer: {
    name: "crossRef",
    level: "inline",
    start: (src) => src.search(new RegExp(`@${ID_SOURCE}`)),
    tokenize(src) {
      const found = matchCrossRef(src);
      return found
        ? { type: "crossRef", raw: found.raw, target: found.target }
        : undefined;
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("crossRef", { target: token.target as string });
  },

  renderMarkdown: (node) => `@${(node.attrs?.target as string | undefined) ?? ""}`,

  addProseMirrorPlugins() {
    return [
      new Plugin<Map<string, Target>>({
        key: numberingKey,
        state: {
          init: (_, state) => numberTargets(state.doc),
          apply: (tr, value) => (tr.docChanged ? numberTargets(tr.doc) : value),
        },
        props: {
          decorations: (state) => decorations(state.doc, numberingOf(state)),
        },
      }),
    ];
  },
});

/** Puts a cross-reference to `target` in place of `range`. */
export function insertCrossRef(
  editor: Editor,
  range: { from: number; to: number },
  target: string,
): void {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent([
      { type: "crossRef", attrs: { target } },
      { type: "text", text: " " },
    ])
    .run();
}

// ---------- Table captions ----------

const CAPTION_LINE = new RegExp(
  `^ {0,3}(?:Table)?:[ \\t]+([^\\n]*?)[ \\t]*\\{#(tbl-[\\w-]*\\w)\\}[ \\t]*(?:\\n|$)`,
);

/**
 * A table's caption, a paragraph of its own next to the table:
 * `: Steps of the pilot {#tbl-steps}`. It reads "Table 1. Steps of the pilot".
 */
export const TableCaption = Node.create({
  name: "tableCaption",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return {
      id: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-table-caption") ?? "",
        renderHTML: (attrs) => ({ "data-table-caption": attrs.id as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "p[data-table-caption]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes, { class: "table-caption" }), 0];
  },

  markdownTokenizer: {
    name: "tableCaption",
    level: "block",
    start: (src) => src.search(/^ {0,3}(?:Table)?:[ \t]/m),
    tokenize(src, _tokens, lexer) {
      const found = CAPTION_LINE.exec(src);
      if (!found) return undefined;
      return {
        type: "tableCaption",
        raw: found[0],
        id: found[2],
        tokens: lexer.inlineTokens(found[1]),
      };
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode(
      "tableCaption",
      { id: token.id as string },
      helpers.parseInline(token.tokens ?? []),
    );
  },

  renderMarkdown(node, helpers) {
    const text = helpers
      .renderChildren(node.content ?? [])
      .replace(/\n+/g, " ")
      .trim();
    return `: ${text} {#${(node.attrs?.id as string | undefined) ?? ""}}`;
  },

  addKeyboardShortcuts() {
    return {
      // Enter ends the caption and goes on in a paragraph under it.
      Enter: ({ editor }) => {
        if (!editor.isActive("tableCaption")) return false;
        const { $from } = editor.state.selection;
        const end = $from.after();
        return editor
          .chain()
          .insertContentAt(end, { type: "paragraph" })
          .setTextSelection(end + 1)
          .run();
      },
    };
  },
});

/**
 * Gives a table a caption: the empty line at the caret becomes one,
 * named after the table above or below it, or the caption goes under
 * the table the caret is in.
 */
export function addTableCaption({ tr, state, dispatch }: CommandProps): boolean {
  const { $from } = tr.selection;
  if ($from.depth < 1) return false;
  const index = $from.index(0);
  const block = tr.doc.child(index);
  const near = [block, tr.doc.maybeChild(index - 1), tr.doc.maybeChild(index + 1)].find(
    (node) => node?.type.name === "table",
  );
  const id = newTargetId(
    "tbl",
    near?.firstChild ? cellWords(near.firstChild) : "",
    numberTargets(tr.doc).keys(),
  );
  const type = state.schema.nodes.tableCaption;
  const start = $from.before(1);
  if (!dispatch) return true;
  if (block.type.name === "table") {
    const end = start + block.nodeSize;
    tr.insert(end, type.create({ id }));
    tr.setSelection(TextSelection.create(tr.doc, end + 1));
  } else if (block.isTextblock) {
    tr.setBlockType(start, start + block.nodeSize, type, { id });
  } else {
    return false;
  }
  return true;
}

const cellWords = (row: ProseNode): string => {
  const words: string[] = [];
  row.forEach((cell) => words.push(cell.textContent));
  return words.join(" ");
};

// ---------- Equations ----------

const EQUATION = new RegExp(`^\\$\\$([^$]+)\\$\\$(?:[ \\t]*\\{#(eq-[\\w-]*\\w)\\})?`);

/** Display math, numbered when it has an id: `$$ … $$ {#eq-energy}`. */
export const Equation = BlockMath.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-id") ?? "",
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.id ? { "data-id": attrs.id as string } : {},
      },
    };
  },

  markdownTokenizer: {
    name: "blockMath",
    level: "block",
    start: (src: string) => src.indexOf("$$"),
    tokenize: (src: string) => {
      const found = EQUATION.exec(src);
      if (!found) return undefined;
      return {
        type: "blockMath",
        raw: found[0],
        latex: found[1].trim(),
        id: found[2] ?? "",
      };
    },
  },

  parseMarkdown: (token) => ({
    type: "blockMath",
    attrs: { latex: token.latex as string, id: (token.id as string | undefined) ?? "" },
  }),

  renderMarkdown: (node) => {
    const id = (node.attrs?.id as string | undefined) ?? "";
    return `$$\n${(node.attrs?.latex as string | undefined) ?? ""}\n$$${id ? ` {#${id}}` : ""}`;
  },
});
