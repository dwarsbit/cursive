import { Extension, type Editor } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { matchesIn, type FindQuery, type FindTarget } from "../lib/find";

interface FindPluginState {
  query: FindQuery | null;
  matches: Array<{ from: number; to: number }>;
  current: number;
  decorations: DecorationSet;
}

const findKey = new PluginKey<FindPluginState>("find");

/** Every place in the document's text that matches, within one block each. */
export function findInDoc(doc: ProseNode, query: FindQuery): Array<{ from: number; to: number }> {
  const found: Array<{ from: number; to: number }> = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // The block's text, with what isn't text (a footnote, an equation) as one mark that matches nothing.
    let text = "";
    const starts: number[] = [];
    node.forEach((child, offset) => {
      const piece = child.isText ? child.text! : "￼";
      for (let i = 0; i < piece.length; i++) starts.push(pos + 1 + offset + i);
      text += piece;
    });
    for (const [from, to] of matchesIn(text, query)) {
      found.push({ from: starts[from], to: starts[to - 1] + 1 });
    }
    return false;
  });
  return found;
}

function decorate(doc: ProseNode, matches: FindPluginState["matches"], current: number) {
  return DecorationSet.create(
    doc,
    matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        class: index === current ? "find-match find-current" : "find-match",
      }),
    ),
  );
}

const EMPTY: FindPluginState = {
  query: null,
  matches: [],
  current: -1,
  decorations: DecorationSet.empty,
};

/** Marks the matches of the find bar in the blocks, and keeps them in step with typing. */
export const Find = Extension.create({
  name: "find",

  addProseMirrorPlugins() {
    return [
      new Plugin<FindPluginState>({
        key: findKey,
        state: {
          init: () => EMPTY,
          apply: (tr, state) => {
            const meta = tr.getMeta(findKey) as Partial<FindPluginState> | undefined;
            if (meta) {
              const next = { ...state, ...meta };
              if (!next.query) return EMPTY;
              return { ...next, decorations: decorate(tr.doc, next.matches, next.current) };
            }
            if (!tr.docChanged || !state.query) return state;
            const matches = findInDoc(tr.doc, state.query);
            const current = Math.min(state.current, matches.length - 1);
            return { ...state, matches, current, decorations: decorate(tr.doc, matches, current) };
          },
        },
        props: {
          decorations: (state) => findKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});

/** The editor as the find bar works on it. */
export function findTargetFor(editor: Editor): FindTarget {
  const state = () => findKey.getState(editor.state) ?? EMPTY;
  const report = () => ({ count: state().matches.length, current: state().current });
  const set = (meta: Partial<FindPluginState>) =>
    editor.view.dispatch(editor.state.tr.setMeta(findKey, meta).setMeta("addToHistory", false));
  const show = (index: number) => {
    const match = state().matches[index];
    if (!match) return;
    // The match is marked, not selected: a selection would bring up the toolbar.
    set({ current: index });
    const dom = editor.view.domAtPos(match.from).node;
    (dom instanceof Element ? dom : dom.parentElement)?.scrollIntoView?.({ block: "center" });
  };
  return {
    find: (query) => {
      const matches = findInDoc(editor.state.doc, query);
      const caret = editor.state.selection.from;
      const after = matches.findIndex((match) => match.from >= caret);
      const current = matches.length ? (after < 0 ? 0 : after) : -1;
      set({ query: query.text ? query : null, matches, current });
      return report();
    },
    move: (step) => {
      const { matches, current } = state();
      if (!matches.length) return report();
      show((current + step + matches.length) % matches.length);
      return report();
    },
    replace: (text) => {
      const { matches, current } = state();
      const match = matches[current];
      if (!match) return report();
      editor
        .chain()
        .command(({ tr }) => {
          tr.insertText(text, match.from, match.to);
          return true;
        })
        .run();
      const after = state().matches.findIndex((next) => next.from >= match.from + text.length);
      if (state().matches.length) show(after < 0 ? 0 : after);
      return report();
    },
    replaceAll: (text) => {
      const { matches } = state();
      if (!matches.length) return 0;
      editor
        .chain()
        .command(({ tr }) => {
          for (const match of [...matches].reverse()) tr.insertText(text, match.from, match.to);
          return true;
        })
        .run();
      return matches.length;
    },
    clear: () => {
      if (!editor.isDestroyed && state().query) set({ query: null });
    },
  };
}
