import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { citedKeys, pageReferences, sameContent, type Reference } from "./reference";
import { numberWorks, styleById, type CitationStyle } from "./styles";
import { activeSources } from "./sources";
import {
  fetchZoteroItems,
  librariesOf,
  zoteroReference,
  type ZoteroItem,
} from "./zotero";

/** What Zotero says about a reference since it was copied. */
export type ReferenceState =
  { state: "changed"; fresh: Reference } | { state: "missing" };

export interface PageReferences {
  /** The page's references, by key. */
  refs: Map<string, Reference>;
  /** The keys the page cites, in the order it first cites them. */
  cited: Set<string>;
  /** The page's citation style. */
  style: CitationStyle;
  /** Each work's number, for a numbered style. */
  numbers: Map<string, number>;
  /** Gives the page another style; missing where the page can't change. */
  setStyle?: (id: string) => void;
  /** References whose item changed or went away in Zotero, by key. */
  states: Map<string, ReferenceState>;
  checking: boolean;
  /** Why the last check didn't finish, or null. */
  problem: string | null;
  /** Asks Zotero again. */
  check: () => void;
  /**
   * Adds a reference where the page keeps them, from outside the
   * editor that has the citation: a presentation keeps its references
   * on one slide. Missing where the editor adds them itself.
   */
  addElsewhere?: (ref: Reference) => void;
}

const NONE: PageReferences = {
  refs: new Map(),
  cited: new Set(),
  style: styleById("apa"),
  numbers: new Map(),
  states: new Map(),
  checking: false,
  problem: null,
  check: () => {},
};

const Context = createContext<PageReferences>(NONE);

export const usePageReferences = () => useContext(Context);

/** Whether a library may hold an item copied from `library`. */
export function mayHold(sourceLibrary: string, library: string): boolean {
  if (sourceLibrary === library) return true;
  // The Zotero app's own library is the user's, which zotero.org holds too.
  const own = (id: string) => id === "local" || id.startsWith("users/");
  return (sourceLibrary === "local" || library === "local") && own(sourceLibrary) && own(library);
}

/** Asks the enabled sources for the items the references came from. */
export async function checkReferences(
  refs: Reference[],
): Promise<Map<string, ReferenceState>> {
  const linked = refs.filter((ref) => ref.zotero);
  const states = new Map<string, ReferenceState>();
  if (!linked.length) return states;
  const sources = await activeSources();
  if (!sources.length) return states;
  const found = new Map<string, ZoteroItem>();
  // Keys a source of the reference's own library answered for.
  const asked = new Set<string>();
  let failure: unknown = null;
  for (const library of sources.flatMap(librariesOf)) {
    const wanted = linked.filter(
      (ref) => !found.has(ref.key) && mayHold(library.id, ref.zotero!.library),
    );
    if (!wanted.length) continue;
    try {
      const items = await fetchZoteroItems(library, [
        ...new Set(wanted.map((ref) => ref.zotero!.item)),
      ]);
      for (const ref of wanted) {
        const item = items.find((candidate) => candidate.key === ref.zotero!.item);
        if (item) found.set(ref.key, item);
        if (library.id === ref.zotero!.library) asked.add(ref.key);
      }
    } catch (error) {
      failure = error;
    }
  }
  for (const ref of linked) {
    const item = found.get(ref.key);
    if (item) {
      const fresh = zoteroReference(item, ref.zotero!.library, [], ref.key);
      if (item.version !== ref.zotero!.version && !sameContent(fresh, ref)) {
        states.set(ref.key, { state: "changed", fresh });
      }
    } else if (asked.has(ref.key)) {
      states.set(ref.key, { state: "missing" });
    }
  }
  if (failure && !found.size && !asked.size) throw failure;
  return states;
}

/**
 * The references of the page in `markdown`, checked against Zotero
 * when the page opens and when they change.
 */
export function ReferencesProvider({
  markdown,
  style: styleName,
  setStyle,
  page,
  live = false,
  addElsewhere,
  children,
}: {
  markdown: string;
  /** The style the page's front matter names, `csl: ieee`. */
  style?: string;
  setStyle?: (id: string) => void;
  /** Names the open page: another page is checked afresh. */
  page?: string | null;
  /** Ask Zotero: only where the page is edited. */
  live?: boolean;
  addElsewhere?: (ref: Reference) => void;
  children: React.ReactNode;
}) {
  const list = useMemo(() => pageReferences(markdown), [markdown]);
  const refs = useMemo(() => new Map(list.map((ref) => [ref.key, ref])), [list]);
  const cited = useMemo(() => citedKeys(markdown), [markdown]);
  const style = useMemo(() => styleById(styleName), [styleName]);
  const numbers = useMemo(() => numberWorks(cited, list), [cited, list]);
  const [states, setStates] = useState<Map<string, ReferenceState>>(new Map());
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [asks, setAsks] = useState(0);
  const latest = useRef(list);
  useEffect(() => {
    latest.current = list;
  });

  // What a check depends on: the items and the versions the page has.
  const links = list
    .filter((ref) => ref.zotero)
    .map(
      (ref) =>
        `${ref.key}:${ref.zotero!.item}:${ref.zotero!.version}:${ref.title.length}`,
    )
    .join(" ");

  useEffect(() => {
    if (!live || !links) {
      const timer = setTimeout(() => setStates(new Map()), 0);
      return () => clearTimeout(timer);
    }
    let current = true;
    const timer = setTimeout(() => {
      setChecking(true);
      checkReferences(latest.current)
        .then((next) => {
          if (!current) return;
          setStates(next);
          setProblem(null);
        })
        .catch((error: unknown) => {
          if (current)
            setProblem(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (current) setChecking(false);
        });
    }, 600);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [live, links, page, asks]);

  const value = useMemo<PageReferences>(
    () => ({
      refs,
      cited,
      style,
      numbers,
      setStyle,
      states,
      checking,
      problem,
      check: () => setAsks((n) => n + 1),
      addElsewhere,
    }),
    [refs, cited, style, numbers, setStyle, states, checking, problem, addElsewhere],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * For an editor inside the page that holds no references of its own,
 * such as a footnote's field: works cited there are added with `add`.
 */
export function ReferencesElsewhere({
  add,
  children,
}: {
  add: (ref: Reference) => void;
  children: React.ReactNode;
}) {
  const outer = useContext(Context);
  const value = useMemo(() => ({ ...outer, addElsewhere: add }), [outer, add]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
