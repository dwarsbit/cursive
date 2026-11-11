import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { filterBlocks, type BlockItem } from "./blocks";

/** What the slash menu shows while it is open. */
export interface SlashState {
  items: BlockItem[];
  query: string;
  /** Where the typed slash is on screen; the menu hangs under it. */
  rect: () => DOMRect | null;
  pick: (item: BlockItem) => void;
}

export interface SlashOptions {
  /** Called with the menu's state, or null when it closes. */
  onChange: (state: SlashState | null) => void;
  /** Lets the open menu answer the arrow keys and Enter. */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

type KeyHandler = (event: KeyboardEvent) => boolean;

/**
 * Connects the extension to the menu that draws it: the menu reads the
 * state as an external store and registers itself for the keys.
 */
export interface SlashController {
  options: SlashOptions;
  subscribe: (listener: () => void) => () => void;
  getState: () => SlashState | null;
  /** Registers the open menu's key handler; returns how to remove it. */
  handleKeys: (handler: KeyHandler) => () => void;
}

export function createSlashController(): SlashController {
  let state: SlashState | null = null;
  let keys: KeyHandler | null = null;
  const listeners = new Set<() => void>();
  return {
    options: {
      onChange: (next) => {
        state = next;
        listeners.forEach((listener) => listener());
      },
      onKeyDown: (event) => keys?.(event) ?? false,
    },
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
  };
}

export const slashKey = new PluginKey("slash");

/** Runs a block's command in place of the typed slash and query. */
export function insertBlock(editor: Editor, range: Range, item: BlockItem): void {
  const chain = item.opensField ? editor.chain() : editor.chain().focus();
  item.run(chain.deleteRange(range)).run();
}

/**
 * The slash menu: typing `/` at the start of a line or after a space
 * lists the blocks, and what you type next filters them.
 */
export const Slash = Extension.create<SlashOptions>({
  name: "slash",

  addOptions() {
    return { onChange: () => {}, onKeyDown: () => false };
  },

  addProseMirrorPlugins() {
    const { onChange, onKeyDown } = this.options;
    return [
      Suggestion<BlockItem, BlockItem>({
        editor: this.editor,
        pluginKey: slashKey,
        char: "/",
        allowSpaces: false,
        shouldShow: ({ editor }) => !editor.isActive("codeBlock"),
        items: ({ query }) => filterBlocks(query),
        command: ({ editor, range, props }) => insertBlock(editor, range, props),
        render: () => {
          const show = (props: {
            items: BlockItem[];
            query: string;
            clientRect?: (() => DOMRect | null) | null;
            command: (item: BlockItem) => void;
          }) =>
            onChange({
              items: props.items,
              query: props.query,
              rect: () => props.clientRect?.() ?? null,
              pick: props.command,
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
