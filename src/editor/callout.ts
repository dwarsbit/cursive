import { mergeAttributes, Node } from "@tiptap/core";

/** The kinds a callout can be, as written after `[!` in Markdown. */
export const CALLOUT_KINDS = [
  "note",
  "tip",
  "important",
  "warning",
  "caution",
] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

const isKind = (value: unknown): value is CalloutKind =>
  (CALLOUT_KINDS as readonly string[]).includes(value as string);

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (kind?: CalloutKind) => ReturnType;
      toggleCallout: (kind?: CalloutKind) => ReturnType;
    };
  }
}

/**
 * A callout: a tinted box around any blocks. In Markdown it is a quote
 * that opens with `[!note]`, the form GitHub and Obsidian read too.
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: "note",
        parseHTML: (el) => {
          const kind = el.getAttribute("data-callout");
          return isKind(kind) ? kind : "note";
        },
        renderHTML: (attrs) => ({ "data-callout": attrs.kind }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "callout" }), ["div", 0]];
  },

  addCommands() {
    return {
      setCallout:
        (kind = "note") =>
        ({ commands }) =>
          commands.wrapIn(this.name, { kind }),
      toggleCallout:
        (kind = "note") =>
        ({ commands }) =>
          commands.toggleWrap(this.name, { kind }),
    };
  },

  markdownTokenizer: {
    name: "callout",
    level: "block",
    start: (src) => src.search(/^ {0,3}> ?\[!/m),
    tokenize(src, _tokens, lexer) {
      const match = /^ {0,3}> ?\[!(\w+)\][ \t]*(?:\n|$)((?: {0,3}>.*(?:\n|$))*)/.exec(
        src,
      );
      if (!match) return undefined;
      const kind = match[1].toLowerCase();
      if (!isKind(kind)) return undefined;
      const body = match[2].replace(/^ {0,3}> ?/gm, "");
      return {
        type: "callout",
        raw: match[0],
        kind,
        tokens: lexer.blockTokens(body),
      };
    },
  },

  parseMarkdown(token, helpers) {
    const content = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode(
      "callout",
      { kind: token.kind },
      content.length ? content : [helpers.createNode("paragraph")],
    );
  },

  renderMarkdown(node, helpers) {
    const body = helpers.renderChildren(node.content ?? [], "\n\n");
    const quoted = body
      .split("\n")
      .map((line) => (line ? `> ${line}` : ">"))
      .join("\n");
    return `> [!${node.attrs?.kind ?? "note"}]\n${quoted}`;
  },
});
