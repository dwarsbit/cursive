import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { tidyMarkdown } from "../lib/page-file";

/**
 * A footnote is written where it is cited, as Pandoc's inline note:
 * `^[The note.]`. The note is one paragraph of inline Markdown, and
 * the file holds no numbers: the page counts its notes as it is drawn.
 */

/** The positions of the brackets in `text` that have no partner. */
function looseBrackets(text: string): number[] {
  const open: number[] = [];
  const loose: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
    } else if (ch === "`") {
      // Brackets in code don't count.
      const run = /^`+/.exec(text.slice(i))![0];
      const close = text.indexOf(run, i + run.length);
      i = close < 0 ? i + run.length - 1 : close + run.length - 1;
    } else if (ch === "[") {
      open.push(i);
    } else if (ch === "]") {
      if (open.length) open.pop();
      else loose.push(i);
    }
  }
  return [...loose, ...open].sort((a, b) => a - b);
}

/** The footnote at the start of `src`: `^[The note.]`, brackets in it balanced. */
export function matchFootnote(src: string): { raw: string; text: string } | null {
  if (!src.startsWith("^[")) return null;
  let depth = 1;
  for (let i = 2; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\\") {
      i++;
    } else if (ch === "`") {
      const run = /^`+/.exec(src.slice(i))![0];
      const close = src.indexOf(run, i + run.length);
      i = close < 0 ? i + run.length - 1 : close + run.length - 1;
    } else if (ch === "\n" && /^[ \t]*(?:\n|$)/.test(src.slice(i + 1))) {
      // A note is one paragraph.
      return null;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]" && --depth === 0) {
      const text = src
        .slice(2, i)
        .replace(/\s*\n\s*/g, " ")
        .trim();
      return text ? { raw: src.slice(0, i + 1), text } : null;
    }
  }
  return null;
}

/** A note as it is written in the file. A bracket without a partner is escaped. */
export function writeFootnote(text: string): string {
  let note = text.replace(/\s*\n\s*/g, " ").trim();
  if (!note) return "";
  const loose = looseBrackets(note);
  for (let at = loose.length - 1; at >= 0; at--) {
    note = `${note.slice(0, loose[at])}\\${note.slice(loose[at])}`;
  }
  // A backslash at the end would escape the closing bracket.
  if (/(?:^|[^\\])(?:\\\\)*\\$/.test(note)) note += "\\";
  return `^[${note}]`;
}

/** A line of Markdown without its footnotes, for a title or a label. */
export function withoutFootnotes(text: string): string {
  let out = "";
  for (let i = 0; i < text.length;) {
    const note = text.startsWith("^[", i) ? matchFootnote(text.slice(i)) : null;
    if (note) i += note.raw.length;
    else out += text[i++];
  }
  return out;
}

const DEFINITION = /^\[\^([^\]\s]+)\]:[ \t]*(.*)$/;
const BLOCK_START =
  /^(?:#{1,6}[ \t]|[-*+][ \t]|\d+[.)][ \t]|>|`{3,}|~{3,}|\||-{3,}[ \t]*$)/;

/**
 * Numbered notes, as GitHub, Obsidian and Pandoc write them (`[^1]` in
 * the text and `[^1]: The note.` further down), rewritten as inline
 * notes. A note of several paragraphs stays as it is written.
 */
export function inlineNumberedNotes(markdown: string): string {
  if (!/^\[\^[^\]\s]+\]:/m.test(markdown)) return markdown;
  const lines = markdown.split("\n");
  const code: boolean[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      code.push(true);
      if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = null;
    } else {
      if (mark) fence = mark;
      code.push(Boolean(mark));
    }
  }

  const notes = new Map<string, { from: number; to: number; text: string }>();
  for (let i = 0; i < lines.length; i++) {
    const found = code[i] ? null : DEFINITION.exec(lines[i]);
    if (!found) continue;
    const parts = [found[2]];
    let to = i + 1;
    while (
      to < lines.length &&
      !code[to] &&
      lines[to].trim() !== "" &&
      !DEFINITION.test(lines[to]) &&
      !BLOCK_START.test(lines[to].trim())
    ) {
      parts.push(lines[to].trim());
      to++;
    }
    let next = to;
    while (next < lines.length && lines[next].trim() === "") next++;
    const more = next > to && next < lines.length && /^(?: {4}|\t)/.test(lines[next]);
    const text = parts.join(" ").trim();
    if (!more && text && !text.includes("[^") && !notes.has(found[1])) {
      notes.set(found[1], { from: i, to, text });
    }
    i = to - 1;
  }
  if (!notes.size) return markdown;

  const defined = new Set<number>();
  for (const note of notes.values()) {
    for (let i = note.from; i < note.to; i++) defined.add(i);
  }
  const used = new Set<string>();
  const out = lines.map((line, index) => {
    if (code[index] || defined.has(index)) return line;
    // Every other piece is inline code, which keeps its text.
    return line
      .split(/(`+[^`]*`+)/)
      .map((piece, at) =>
        at % 2
          ? piece
          : piece.replace(/\[\^([^\]\s]+)\]/g, (whole, label: string) => {
              const note = notes.get(label);
              if (!note) return whole;
              used.add(label);
              return writeFootnote(note.text);
            }),
      )
      .join("");
  });
  if (!used.size) return markdown;
  const gone = new Set<number>();
  for (const [label, note] of notes) {
    if (!used.has(label)) continue;
    for (let i = note.from; i < note.to; i++) gone.add(i);
  }
  return tidyMarkdown(out.filter((_line, index) => !gone.has(index)).join("\n"));
}

export interface FootnoteOptions {
  /** Called with a footnote's position when it is added or clicked, to open its field. */
  onOpen: ((pos: number) => void) | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnote: {
      /** Adds an empty footnote after the selection and opens its field. */
      insertFootnote: () => ReturnType;
    };
  }
}

/**
 * A footnote in the text: one unit the caret steps over, drawn as its
 * number. The note itself is the node's `text`, as inline Markdown.
 */
export const Footnote = Node.create<FootnoteOptions>({
  name: "footnote",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { onOpen: null };
  },

  addAttributes() {
    return {
      text: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-footnote") ?? "",
        renderHTML: (attrs) => ({
          "data-footnote": attrs.text as string,
          title: attrs.text as string,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "sup[data-footnote]" }];
  },

  renderHTML({ HTMLAttributes }) {
    // The number is counted by the style sheet, so it follows the page.
    return ["sup", mergeAttributes(HTMLAttributes, { class: "footnote" })];
  },

  renderText({ node }) {
    return writeFootnote(node.attrs.text as string);
  },

  markdownTokenizer: {
    name: "footnote",
    level: "inline",
    start: (src) => src.indexOf("^["),
    tokenize(src) {
      const found = matchFootnote(src);
      return found ? { type: "footnote", raw: found.raw, text: found.text } : undefined;
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("footnote", { text: token.text as string });
  },

  renderMarkdown(node) {
    return writeFootnote((node.attrs?.text as string | undefined) ?? "");
  },

  addCommands() {
    return {
      insertFootnote:
        () =>
        ({ state, tr, dispatch, editor }) => {
          const { $to } = state.selection;
          if ($to.parent.type.spec.code || !$to.parent.inlineContent) return false;
          if (editor.isActive("code")) return false;
          if (!dispatch) return true;
          const pos = $to.pos;
          tr.insert(pos, this.type.create({ text: "" }));
          tr.setSelection(NodeSelection.create(tr.doc, pos));
          const open = this.options.onOpen;
          if (open) queueMicrotask(() => open(pos));
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return { "Mod-Alt-f": () => this.editor.commands.insertFootnote() };
  },

  // Typing ^[a note] turns into the footnote on the closing bracket.
  addInputRules() {
    return [
      new InputRule({
        find: /\^\[([^[\]\n]*[^[\]\s][^[\]\n]*)\]$/,
        handler: ({ state, range, match }) => {
          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create({ text: match[1].trim() }),
          );
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("footnoteOpen"),
        props: {
          handleClickOn: (view, _pos, node, nodePos) => {
            const open = this.options.onOpen;
            if (node.type !== this.type || !open || !view.editable) return false;
            open(nodePos);
            return true;
          },
        },
      }),
    ];
  },
});
