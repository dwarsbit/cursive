import { Extension, InputRule, mergeAttributes, Node, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { matchPageLink, writePageLink } from "@/lib/links";

/**
 * A link to another page of the project, written `[[Page title]]` or
 * `[[Page title|other words]]`. In the text it is one unit the caret
 * steps over, drawn with the page's title (`PageLinkView`).
 */
export const PageLink = Node.create({
  name: "pageLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-page-link") ?? "",
        renderHTML: (attrs) => ({ "data-page-link": attrs.target as string }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label") ?? "",
        renderHTML: (attrs) =>
          attrs.label ? { "data-label": attrs.label as string } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-page-link]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "page-link" }),
      (node.attrs.label as string) || (node.attrs.target as string),
    ];
  },

  renderText({ node }) {
    return (node.attrs.label as string) || (node.attrs.target as string);
  },

  markdownTokenizer: {
    name: "pageLink",
    level: "inline",
    start: (src) => src.indexOf("[["),
    tokenize(src) {
      const found = matchPageLink(src);
      return found
        ? { type: "pageLink", raw: found.raw, target: found.target, label: found.label }
        : undefined;
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode("pageLink", {
      target: token.target as string,
      label: token.label as string,
    });
  },

  renderMarkdown(node) {
    return writePageLink(
      (node.attrs?.target as string | undefined) ?? "",
      (node.attrs?.label as string | undefined) ?? "",
    );
  },

  // Typing [[Page title]] turns into the link on the closing brackets.
  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^[\]|\n]+?)(?:\|([^[\]\n]*))?\]\]$/,
        handler: ({ state, range, match }) => {
          const found = matchPageLink(match[0]);
          if (!found) return null;
          state.tr.replaceWith(
            range.from,
            range.to,
            this.type.create({ target: found.target, label: found.label }),
          );
        },
      }),
    ];
  },
});

/** What the link menu needs while it is open. */
export interface LinkMenuState {
  editor: Editor;
  query: string;
  range: Range;
  rect: () => DOMRect | null;
}

type KeyHandler = (event: KeyboardEvent) => boolean;

export interface LinkMenuController {
  options: { onChange: (state: LinkMenuState | null) => void; onKeyDown: KeyHandler };
  subscribe: (listener: () => void) => () => void;
  getState: () => LinkMenuState | null;
  handleKeys: (handler: KeyHandler) => () => void;
  close: () => void;
}

export function createLinkMenuController(): LinkMenuController {
  let state: LinkMenuState | null = null;
  let keys: KeyHandler | null = null;
  const listeners = new Set<() => void>();
  const set = (next: LinkMenuState | null) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    options: { onChange: set, onKeyDown: (event) => keys?.(event) ?? false },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    handleKeys: (handler) => {
      keys = handler;
      return () => {
        if (keys === handler) keys = null;
      };
    },
    close: () => set(null),
  };
}

export const linkMenuKey = new PluginKey("pageLinkMenu");

/** Linking as you type: `[[` opens a menu of the project's pages. */
export const PageLinkMenu = Extension.create<LinkMenuController["options"]>({
  name: "pageLinkMenu",

  addOptions() {
    return { onChange: () => {}, onKeyDown: () => false };
  },

  addProseMirrorPlugins() {
    const { onChange, onKeyDown } = this.options;
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: linkMenuKey,
        char: "[[",
        allowSpaces: true,
        allowedPrefixes: null,
        shouldShow: ({ editor, query }) =>
          !editor.isActive("codeBlock") && !editor.isActive("code") && !/[[\]]/.test(query),
        items: () => [],
        command: () => {},
        render: () => {
          const show = (props: {
            editor: Editor;
            query: string;
            range: Range;
            clientRect?: (() => DOMRect | null) | null;
          }) =>
            onChange({
              editor: props.editor,
              query: props.query,
              range: props.range,
              rect: () => props.clientRect?.() ?? null,
            });
          return {
            onStart: show,
            onUpdate: show,
            onKeyDown: ({ event }) => {
              if (event.key === "Escape") {
                onChange(null);
                return true;
              }
              return onKeyDown(event);
            },
            onExit: () => onChange(null),
          };
        },
      }),
    ];
  },
});

/** Puts a link to a page where `[[` and the query were typed. */
export function insertPageLink(editor: Editor, range: Range, target: string): void {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent([
      { type: "pageLink", attrs: { target, label: "" } },
      { type: "text", text: " " },
    ])
    .run();
}
