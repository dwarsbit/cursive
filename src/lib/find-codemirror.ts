import { EditorSelection, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { matchesIn, type FindQuery, type FindTarget } from "./find";

interface Found {
  query: FindQuery | null;
  matches: Array<[number, number]>;
  current: number;
}

const setFound = StateEffect.define<Found>();
const NONE: Found = { query: null, matches: [], current: -1 };

const mark = Decoration.mark({ class: "find-match" });
const currentMark = Decoration.mark({ class: "find-match find-current" });

function decorations(found: Found): DecorationSet {
  return Decoration.set(
    found.matches.map(([from, to], index) =>
      (index === found.current ? currentMark : mark).range(from, to),
    ),
  );
}

/** The matches of the find bar in the file, kept in step with typing. */
export const findField = StateField.define<{ found: Found; decorations: DecorationSet }>({
  create: () => ({ found: NONE, decorations: Decoration.none }),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setFound)) return { found: effect.value, decorations: decorations(effect.value) };
    }
    if (!tr.docChanged || !value.found.query) return value;
    const matches = matchesIn(tr.newDoc.toString(), value.found.query);
    const found = { ...value.found, matches, current: Math.min(value.found.current, matches.length - 1) };
    return { found, decorations: decorations(found) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

/** The file in Markdown mode as the find bar works on it. */
export function codeMirrorFindTarget(view: EditorView): FindTarget {
  const found = () => view.state.field(findField).found;
  const report = () => ({ count: found().matches.length, current: found().current });
  const show = (index: number) => {
    const match = found().matches[index];
    if (!match) return;
    view.dispatch({
      effects: [
        setFound.of({ ...found(), current: index }),
        EditorView.scrollIntoView(match[0], { y: "center" }),
      ],
      selection: EditorSelection.single(match[0], match[1]),
    });
  };
  return {
    find: (query) => {
      const matches = matchesIn(view.state.doc.toString(), query);
      const caret = view.state.selection.main.from;
      const after = matches.findIndex(([from]) => from >= caret);
      const current = matches.length ? (after < 0 ? 0 : after) : -1;
      view.dispatch({ effects: setFound.of({ query: query.text ? query : null, matches, current }) });
      return report();
    },
    move: (step) => {
      const { matches, current } = found();
      if (matches.length) show((current + step + matches.length) % matches.length);
      return report();
    },
    replace: (text) => {
      const { matches, current } = found();
      const match = matches[current];
      if (!match) return report();
      view.dispatch({ changes: { from: match[0], to: match[1], insert: text } });
      const after = found().matches.findIndex(([from]) => from >= match[0] + text.length);
      if (found().matches.length) show(after < 0 ? 0 : after);
      return report();
    },
    replaceAll: (text) => {
      const { matches } = found();
      if (!matches.length) return 0;
      view.dispatch({
        changes: matches.map(([from, to]) => ({ from, to, insert: text })),
      });
      return matches.length;
    },
    clear: () => {
      if (found().query) view.dispatch({ effects: setFound.of(NONE) });
    },
  };
}
