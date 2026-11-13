import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";

/** What the citation menu needs while it is open. */
export interface CiteState {
  editor: Editor;
  query: string;
  range: Range;
  rect: () => DOMRect | null;
}

type KeyHandler = (event: KeyboardEvent) => boolean;

export interface CiteController {
  options: { onChange: (state: CiteState | null) => void; onKeyDown: KeyHandler };
  subscribe: (listener: () => void) => () => void;
  getState: () => CiteState | null;
  handleKeys: (handler: KeyHandler) => () => void;
  close: () => void;
}

export function createCiteController(): CiteController {
  let state: CiteState | null = null;
  let keys: KeyHandler | null = null;
  const listeners = new Set<() => void>();
  const set = (next: CiteState | null) => {
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

export const citeKey = new PluginKey("cite");

/**
 * Citing as you type: `@` at the start of a word opens a menu of works
 * from the page and from Zotero, and what you type next searches them.
 */
export const Cite = Extension.create<CiteController["options"]>({
  name: "cite",

  addOptions() {
    return { onChange: () => {}, onKeyDown: () => false };
  },

  addProseMirrorPlugins() {
    const { onChange, onKeyDown } = this.options;
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: citeKey,
        char: "@",
        allowSpaces: false,
        allowedPrefixes: [" ", "(", "["],
        shouldShow: ({ editor }) =>
          !editor.isActive("codeBlock") && !editor.isActive("code"),
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
