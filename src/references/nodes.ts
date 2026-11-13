import { mergeAttributes, Node } from "@tiptap/core";
import {
  matchBibliography,
  matchCitation,
  toBibliographyFence,
  writeCitation,
  type CiteItem,
} from "./reference";

/**
 * A citation in the text, `[@key, p. 4]`: one unit the caret steps
 * over. It is drawn from the page's references (`CitationView.tsx`).
 */
export const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      items: {
        default: [] as CiteItem[],
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute("data-items") ?? "[]") as CiteItem[];
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) => ({ "data-items": JSON.stringify(attrs.items) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-citation]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-citation": "" }),
      writeCitation(node.attrs.items as CiteItem[]),
    ];
  },

  renderText({ node }) {
    return writeCitation(node.attrs.items as CiteItem[]);
  },

  markdownTokenizer: {
    name: "citation",
    level: "inline",
    start: (src) => src.indexOf("[@"),
    tokenize(src) {
      const found = matchCitation(src);
      return found
        ? { type: "citation", raw: found.raw, items: found.items }
        : undefined;
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("citation", { items: token.items as CiteItem[] });
  },

  renderMarkdown(node) {
    return writeCitation((node.attrs?.items as CiteItem[] | undefined) ?? []);
  },
});

/**
 * The page's references, as a fence of YAML that the editor draws as
 * the reference list (`BibliographyView.tsx`).
 */
export const Bibliography = Node.create({
  name: "bibliography",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      source: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-source") ?? "",
        renderHTML: (attrs) => ({ "data-source": attrs.source as string }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-bibliography]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-bibliography": "" })];
  },

  markdownTokenizer: {
    name: "bibliography",
    level: "block",
    start: (src) => src.search(/^`{3,}bibliography[ \t]*$/m),
    tokenize(src) {
      const fence = matchBibliography(src);
      return fence
        ? { type: "bibliography", raw: fence.raw, source: fence.source }
        : undefined;
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("bibliography", { source: token.source as string });
  },

  renderMarkdown(node) {
    return toBibliographyFence((node.attrs?.source as string | undefined) ?? "");
  },
});
