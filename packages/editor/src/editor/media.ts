import { Extension, mergeAttributes, Node, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Images and attached files. Both are Markdown's own: an image is
 * `![What it shows](attachments/chart.png)`, a file is a link to it,
 * `[Interview guide.pdf](attachments/Interview%20guide.pdf)`. The files
 * live in the project's `attachments` folder, and the page names them
 * relative to its own file, so other Markdown tools find them too.
 */

/** An address as Markdown writes it: in angle brackets when it has spaces. */
export function writeHref(href: string): string {
  return /[\s()<>]/.test(href) ? `<${href.replace(/[<>]/g, "")}>` : href;
}

/** Words between brackets: brackets in them are escaped unless they pair up. */
function writeLabel(text: string): string {
  const line = text.replace(/\n+/g, " ");
  let depth = 0;
  for (const ch of line.replace(/\\./g, "")) {
    if (ch === "[") depth++;
    else if (ch === "]" && --depth < 0) break;
  }
  return depth === 0 ? line : line.replace(/([[\]\\])/g, "\\$1");
}
const readLabel = (text: string) => text.replace(/\\([[\]\\])/g, "$1");

const IMAGE_LINE =
  /^ {0,3}!\[((?:\\.|\[[^\]\n]*\]|[^\\[\]\n])*)\]\(\s*(<[^>\n]*>|[^\s)]+)(?:\s+"([^"\n]*)")?\s*\)(?:\{#(fig-[\w-]*\w)\})?[ \t]*(?=\n[ \t]*\n|\n?$)\n?/;

/** The image on a line of its own at the start of `src`. */
export function matchImageLine(
  src: string,
): { raw: string; src: string; alt: string; title: string; id: string } | null {
  const found = IMAGE_LINE.exec(src);
  if (!found) return null;
  return {
    raw: found[0],
    src: found[2].replace(/^<|>$/g, ""),
    alt: readLabel(found[1]),
    title: found[3] ?? "",
    id: found[4] ?? "",
  };
}

function imageMarkdown(attrs: Record<string, unknown> | undefined): string {
  const src = writeHref((attrs?.src as string | undefined) ?? "");
  const alt = writeLabel((attrs?.alt as string | undefined) ?? "");
  const title = ((attrs?.title as string | undefined) ?? "").replace(/"/g, "'");
  const image = title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
  const id = (attrs?.id as string | undefined) ?? "";
  return id ? `${image}{#${id}}` : image;
}

const imageAttributes = () => ({
  src: { default: "" },
  alt: { default: "" },
  title: { default: "" },
});

/**
 * An image on a line of its own: a block of the page. With an id,
 * `![Scores per week](scores.png){#fig-scores}`, it is a numbered
 * figure and its description is the caption under it.
 */
export const Image = Node.create({
  name: "image",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes: () => ({ ...imageAttributes(), id: { default: "" } }),

  parseHTML() {
    return [{ tag: "figure[data-image] img[src]" }, { tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", { "data-image": "" }, ["img", mergeAttributes(HTMLAttributes)]];
  },

  markdownTokenName: "imageBlock",

  markdownTokenizer: {
    name: "imageBlock",
    level: "block",
    start: (src) => src.search(/^ {0,3}!\[/m),
    tokenize(src) {
      const found = matchImageLine(src);
      return found
        ? {
            type: "imageBlock",
            raw: found.raw,
            src: found.src,
            alt: found.alt,
            title: found.title,
            id: found.id,
          }
        : undefined;
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("image", {
      src: token.src as string,
      alt: token.alt as string,
      title: token.title as string,
      id: (token.id as string | undefined) ?? "",
    });
  },

  renderMarkdown: (node) => imageMarkdown(node.attrs),
});

/** An image in a line of text. */
export const InlineImage = Node.create({
  name: "inlineImage",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes: imageAttributes,

  parseHTML() {
    return [{ tag: "img[src][data-inline]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { "data-inline": "" })];
  },

  renderText({ node }) {
    return (node.attrs.alt as string) || "";
  },

  markdownTokenName: "image",

  parseMarkdown(token, helpers) {
    return helpers.createNode("inlineImage", {
      src: (token.href as string | undefined) ?? "",
      alt: readLabel((token.text as string | undefined) ?? ""),
      title: (token.title as string | undefined) ?? "",
    });
  },

  renderMarkdown: (node) => imageMarkdown(node.attrs),
});

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Whether an address names a file of the project that isn't a page. */
export function isFileHref(href: string): boolean {
  if (!href || HAS_SCHEME.test(href) || /^[#/]/.test(href)) return false;
  const path = href.replace(/[?#].*$/, "");
  return /\.[A-Za-z0-9]{1,8}$/.test(path) && !/\.md$/i.test(path);
}

const ATTACHMENT = /^\[((?:\\.|[^[\]\\\n])+)\]\(\s*(<[^>\n]+>|[^)\s]+)\s*\)/;

/** A file of the project in the text: its name, and a click opens it. */
export const Attachment = Node.create({
  name: "attachment",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      href: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-attachment") ?? "",
        renderHTML: (attrs) => ({ "data-attachment": attrs.href as string }),
      },
      name: { default: "", rendered: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-attachment]",
        getAttrs: (el) => ({ name: el.textContent ?? "" }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "attachment" }),
      node.attrs.name as string,
    ];
  },

  renderText({ node }) {
    return node.attrs.name as string;
  },

  markdownTokenizer: {
    name: "attachment",
    level: "inline",
    start: (src) => src.search(/(?<![!^[])\[(?![[@])/),
    tokenize(src) {
      const found = ATTACHMENT.exec(src);
      if (!found) return undefined;
      const href = found[2].replace(/^<|>$/g, "");
      if (!isFileHref(href)) return undefined;
      return { type: "attachment", raw: found[0], href, name: readLabel(found[1]) };
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("attachment", {
      href: token.href as string,
      name: token.name as string,
    });
  },

  renderMarkdown(node) {
    const href = (node.attrs?.href as string | undefined) ?? "";
    const name = (node.attrs?.name as string | undefined) || href;
    return `[${writeLabel(name)}](${writeHref(href)})`;
  },
});

/** A file the reader added, as the page names it. */
export interface AddedFile {
  /** The address relative to the page. */
  href: string;
  name: string;
  image: boolean;
}

/**
 * Puts files in the page at `pos`, or at the caret: each image on a
 * line of its own, files in the text. An empty line takes the first
 * image itself.
 */
export function insertFiles(editor: Editor, files: AddedFile[], pos?: number): void {
  if (!files.length) return;
  const { state } = editor;
  const at = state.doc.resolve(
    Math.min(pos ?? state.selection.to, state.doc.content.size),
  );
  const images = files.filter((file) => file.image);
  const others = files.filter((file) => !file.image);
  const chain = editor.chain().focus();
  const inText = at.parent.inlineContent && !at.parent.type.spec.code;
  let cursor = at.pos;
  if (others.length && inText) {
    const content = others.flatMap((file, index) => [
      ...(index > 0 ? [{ type: "text", text: " " }] : []),
      { type: "attachment", attrs: { href: file.href, name: file.name } },
    ]);
    chain.insertContentAt(cursor, content);
    cursor += content.length;
  }
  const blocks = [
    ...images.map((file) => ({
      type: "image",
      attrs: { src: file.href, alt: "", title: "" },
    })),
    ...(inText
      ? []
      : others.map((file) => ({
          type: "paragraph",
          content: [{ type: "attachment", attrs: { href: file.href, name: file.name } }],
        }))),
  ];
  if (blocks.length) {
    chain.command(({ tr }) => {
      const $pos = tr.doc.resolve(tr.mapping.map(cursor));
      const empty = $pos.parent.type.name === "paragraph" && $pos.parent.content.size === 0;
      if (empty && $pos.depth === 1) {
        tr.replaceWith($pos.before(), $pos.after(), blocks.map((b) => tr.doc.type.schema.nodeFromJSON(b)));
      } else {
        const after = $pos.depth > 0 ? $pos.after(1) : tr.doc.content.size;
        tr.insert(after, blocks.map((b) => tr.doc.type.schema.nodeFromJSON(b)));
      }
      return true;
    });
  }
  chain.run();
}

type FilesHandler = (files: File[], pos: number | null) => boolean;

/** Passes files pasted or dropped into a page to whoever handles them now. */
export function createFileDropController() {
  let handler: FilesHandler | null = null;
  return {
    options: { onFiles: (files: File[], pos: number | null) => handler?.(files, pos) ?? false },
    handle: (next: FilesHandler) => {
      handler = next;
      return () => {
        if (handler === next) handler = null;
      };
    },
  };
}

export interface FileDropOptions {
  /** Called with files pasted or dropped into the page, and where they were dropped. */
  onFiles: ((files: File[], pos: number | null) => boolean) | null;
}

/** Pasting or dropping files into a page adds them to the project. */
export const FileDrop = Extension.create<FileDropOptions>({
  name: "fileDrop",

  addOptions() {
    return { onFiles: null };
  },

  addProseMirrorPlugins() {
    const take = (files: FileList | null | undefined, pos: number | null) => {
      const list = [...(files ?? [])];
      if (!list.length || !this.options.onFiles) return false;
      return this.options.onFiles(list, pos);
    };
    return [
      new Plugin({
        key: new PluginKey("fileDrop"),
        props: {
          handlePaste: (_view, event) => take(event.clipboardData?.files, null),
          handleDrop: (view, event) => {
            const files = event.dataTransfer?.files;
            if (!files?.length) return false;
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
            return take(files, at?.pos ?? null);
          },
        },
      }),
    ];
  },
});
