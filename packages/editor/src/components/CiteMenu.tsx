import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import type { Editor, Range } from "@tiptap/core";
import { BookMarked, Settings } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CiteController, CiteState } from "../editor/cite";
import { insertCrossRef, numberingOf, type Target } from "../editor/numbering";
import { entryPlain } from "../references/styles";
import { mayHold, usePageReferences } from "../references/context";
import {
  putReference,
  readBibliography,
  toBibliographyFence,
  writeBibliography,
  type Reference,
} from "../references/reference";
import { lookUp, lookupOf } from "../references/lookup";
import {
  activeBibFiles,
  activeSources,
  readBibFile,
  sourceName,
  useSources,
  type BibSource,
} from "../references/sources";
import {
  librariesOf,
  searchZotero,
  zoteroReference,
  zoteroYear,
  type ZoteroItem,
  type ZoteroLibrary,
} from "../references/zotero";
import { cn } from "../lib/cn";
import { messageOf } from "./Dialog";

type Option =
  | { kind: "page"; ref: Reference }
  | { kind: "target"; target: Target }
  | { kind: "zotero"; item: ZoteroItem; library: ZoteroLibrary }
  | { kind: "bib"; ref: Reference; source: BibSource }
  | { kind: "lookup"; ref: Reference };

/** Asks the app to open its settings at the references. */
export const openReferenceSettings = () =>
  window.dispatchEvent(new CustomEvent("cursive:settings", { detail: "references" }));

function matches(ref: Reference, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [ref.key, ref.title, ref.year, ...ref.author]
    .join(" ")
    .toLowerCase()
    .split(/[\s,]+/)
    .some((word) => word.startsWith(q));
}

function targetMatches(target: Target, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (target.id.startsWith(q)) return true;
  return [target.label, target.kind === "eq" ? "" : target.caption]
    .join(" ")
    .toLowerCase()
    .split(/[\s,.]+/)
    .some((word) => word.startsWith(q));
}

/**
 * Puts a citation where `@` and the query were typed, and the work in
 * the page's references: in the bibliography block of this editor, or
 * where `elsewhere` keeps them, or in a new bibliography at the end.
 */
export function insertCitation(
  editor: Editor,
  range: Range,
  ref: Reference,
  elsewhere?: (ref: Reference) => void,
): void {
  editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContent([
      { type: "citation", attrs: { items: [{ key: ref.key, locator: "" }] } },
      { type: "text", text: " " },
    ])
    .command(({ tr }) => {
      let found = -1;
      tr.doc.descendants((node, pos) => {
        if (found >= 0) return false;
        if (node.type.name === "bibliography") found = pos;
        return node.isBlock;
      });
      if (found >= 0) {
        const node = tr.doc.nodeAt(found)!;
        const refs = readBibliography(node.attrs.source as string) ?? [];
        if (refs.some((other) => other.key === ref.key)) return true;
        tr.setNodeMarkup(found, undefined, {
          ...node.attrs,
          source: writeBibliography(putReference(refs, ref)),
        });
        return true;
      }
      if (elsewhere) return true;
      const type = tr.doc.type.schema.nodes.bibliography;
      tr.insert(tr.doc.content.size, type.create({ source: writeBibliography([ref]) }));
      return true;
    })
    .run();
  // A presentation keeps its references on one slide; this one has none.
  const here = editor.state.doc.toJSON() as { content?: Array<{ type: string }> };
  if (elsewhere && !here.content?.some((node) => node.type === "bibliography"))
    elsewhere(ref);
}

/**
 * Puts a work in the page's references without citing it here: in the
 * bibliography block of this editor, or where `elsewhere` keeps them,
 * or in a new bibliography at the end.
 */
export function addReference(
  editor: Editor,
  ref: Reference,
  elsewhere?: (ref: Reference) => void,
): void {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === "bibliography") found = pos;
    return node.isBlock;
  });
  if (found < 0 && elsewhere) {
    elsewhere(ref);
    return;
  }
  editor
    .chain()
    .command(({ tr }) => {
      if (found < 0) {
        const type = tr.doc.type.schema.nodes.bibliography;
        tr.insert(
          tr.doc.content.size,
          type.create({ source: writeBibliography([ref]) }),
        );
        return true;
      }
      const node = tr.doc.nodeAt(found)!;
      const refs = readBibliography(node.attrs.source as string) ?? [];
      if (refs.some((other) => other.key === ref.key)) return true;
      tr.setNodeMarkup(found, undefined, {
        ...node.attrs,
        source: writeBibliography(putReference(refs, ref)),
      });
      return true;
    })
    .run();
}

export const bibliographyFence = (refs: Reference[]) =>
  toBibliographyFence(writeBibliography(refs));

const GROUP_HEAD = "px-2 pt-2 pb-1 text-2xs font-medium text-muted-foreground";
const NOTE = "px-2 py-2 text-xs text-muted-foreground";

interface Found {
  query: string;
  zotero: Option[];
  bib: Option[];
  problem: string | null;
}

/**
 * The works to cite under a typed `@`: the page's first, then its
 * figures, tables and equations, then Zotero's and the BibTeX files'.
 * A DOI or an ISBN is looked up.
 */
export function CiteMenu({
  state,
  controller,
}: {
  state: CiteState;
  controller: CiteController;
}) {
  const { editor, query, range, rect } = state;
  const { refs, addElsewhere, style } = usePageReferences();
  const sources = useSources();
  const [found, setFound] = useState<Found | null>(null);
  const [looked, setLooked] = useState<{
    query: string;
    ref: Reference | null;
    problem: string | null;
  } | null>(null);
  const [selected, setSelected] = useState(0);
  const [lastQuery, setLastQuery] = useState(query);
  const menuRef = useRef<HTMLDivElement>(null);

  if (query !== lastQuery) {
    setLastQuery(query);
    setSelected(0);
  }

  const hasZotero = sources.some((source) => source.enabled && source.kind !== "bibtex");
  const hasBib = sources.some((source) => source.enabled && source.kind === "bibtex");
  const hasSources = hasZotero || hasBib;
  const lookup = lookupOf(query);
  const onPage: Option[] = [...refs.values()]
    .filter((ref) => matches(ref, query))
    .slice(0, 5)
    .map((ref) => ({ kind: "page", ref }));
  const targets: Option[] = [...numberingOf(editor.state).values()]
    .filter((target) => targetMatches(target, query))
    .slice(0, 5)
    .map((target) => ({ kind: "target", target }));
  const pageItems = new Set(
    onPage.map((o) => (o.kind === "page" ? o.ref.zotero?.item : "")),
  );
  const current = found?.query === query ? found : null;
  const fromZotero = (current?.zotero ?? []).filter(
    (o) => o.kind === "zotero" && !pageItems.has(o.item.key),
  );
  const fromBib = (current?.bib ?? []).filter(
    (o) => o.kind === "bib" && !refs.has(o.ref.key),
  );
  const lookedUp = looked?.query === query ? looked : null;
  const fromLookup: Option[] =
    lookedUp?.ref && !refs.has(lookedUp.ref.key) ? [{ kind: "lookup", ref: lookedUp.ref }] : [];
  const options = [...onPage, ...targets, ...fromLookup, ...fromZotero, ...fromBib];
  const searching = hasSources && !current;
  const index = Math.min(selected, Math.max(0, options.length - 1));

  // Zotero and the BibTeX files are asked a moment after the typing rests.
  useEffect(() => {
    if (!hasSources) return;
    let live = true;
    const timer = setTimeout(() => {
      void (async () => {
        const zotero: Option[] = [];
        const bib: Option[] = [];
        const seen = new Set<string>();
        let failure: string | null = null;
        for (const source of await activeSources()) {
          for (const library of librariesOf(source)) {
            try {
              for (const item of await searchZotero(library, query)) {
                if (seen.has(`${library.id}:${item.key}`)) continue;
                seen.add(`${library.id}:${item.key}`);
                zotero.push({ kind: "zotero", item, library });
              }
            } catch (error) {
              failure = messageOf(error);
            }
          }
        }
        for (const source of await activeBibFiles()) {
          try {
            for (const ref of (await readBibFile(source))
              .filter((ref) => query.trim() && matches(ref, query))
              .slice(0, 12)) {
              bib.push({ kind: "bib", ref, source });
            }
          } catch (error) {
            failure = messageOf(error);
          }
        }
        if (!live) return;
        setFound({
          query,
          zotero,
          bib,
          problem: zotero.length || bib.length ? null : failure,
        });
      })();
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, hasSources]);

  // A DOI or an ISBN is looked up once the typing rests.
  const lookupKey = lookup ? `${lookup.kind}:${lookup.id}` : "";
  useEffect(() => {
    const wanted = lookupOf(query);
    if (!wanted) return;
    let live = true;
    const timer = setTimeout(() => {
      lookUp(wanted, refs.keys())
        .then((ref) => {
          if (live)
            setLooked({
              query,
              ref,
              problem: ref
                ? null
                : wanted.kind === "doi"
                  ? "No work has this DOI."
                  : "Open Library has no book with this ISBN.",
            });
        })
        .catch((error: unknown) => {
          if (live) setLooked({ query, ref: null, problem: messageOf(error) });
        });
    }, 400);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // The lookup is asked again only when what it looks up changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey]);

  const pick = (option: Option) => {
    controller.close();
    if (option.kind === "target") {
      insertCrossRef(editor, range, option.target.id);
      return;
    }
    if (option.kind === "page" || option.kind === "bib" || option.kind === "lookup") {
      insertCitation(editor, range, option.ref, addElsewhere);
      return;
    }
    const known = [...refs.values()].find(
      (ref) =>
        ref.zotero?.item === option.item.key &&
        mayHold(option.library.id, ref.zotero.library),
    );
    const ref = known ?? zoteroReference(option.item, option.library.id, refs.keys());
    insertCitation(editor, range, ref, addElsewhere);
  };

  useEffect(() =>
    controller.handleKeys((event) => {
      if (!options.length) return false;
      if (event.key === "ArrowDown") {
        setSelected((index + 1) % options.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((index + options.length - 1) % options.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        pick(options[index]);
        return true;
      }
      return false;
    }),
  );

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    void computePosition(
      { getBoundingClientRect: () => rect() ?? new DOMRect() },
      menu,
      {
        placement: "bottom-start",
        strategy: "fixed",
        middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
      },
    ).then(({ x, y }) => {
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.style.visibility = "visible";
    });
  }, [rect, options.length]);

  useEffect(() => {
    menuRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index, query]);

  const zoteroLibraries = new Set(
    fromZotero.map((o) => (o.kind === "zotero" ? o.library.id : "")),
  ).size;
  const bibFiles = new Set(fromBib.map((o) => (o.kind === "bib" ? o.source.id : ""))).size;
  const refDetail = (ref: Reference) =>
    [
      ref.author
        .map((name) => name.split(",")[0])
        .slice(0, 3)
        .join(", "),
      ref.year,
    ]
      .filter(Boolean)
      .join(" · ");

  const row = (option: Option, at: number) => {
    const on = at === index;
    let title: string;
    let detail: string;
    let key: string;
    if (option.kind === "page") {
      title = option.ref.title;
      detail = `@${option.ref.key}`;
      key = `p:${option.ref.key}`;
    } else if (option.kind === "target") {
      title = [option.target.label, option.target.caption].filter(Boolean).join(". ");
      detail = `@${option.target.id}`;
      key = `t:${option.target.id}`;
    } else if (option.kind === "zotero") {
      title = option.item.title ?? "";
      detail = [
        (option.item.creators ?? [])
          .map((c) => c.lastName || c.name || "")
          .filter(Boolean)
          .slice(0, 3)
          .join(", "),
        zoteroYear(option.item.date),
        zoteroLibraries > 1 ? option.library.group || sourceName(option.library.source) : "",
      ]
        .filter(Boolean)
        .join(" · ");
      key = `z:${option.library.id}:${option.item.key}`;
    } else if (option.kind === "bib") {
      title = option.ref.title;
      detail = [`@${option.ref.key}`, refDetail(option.ref), bibFiles > 1 ? sourceName(option.source) : ""]
        .filter(Boolean)
        .join(" · ");
      key = `b:${option.source.id}:${option.ref.key}`;
    } else {
      title = option.ref.title;
      detail = refDetail(option.ref);
      key = `l:${option.ref.key}`;
    }
    return (
      <button
        key={key}
        type="button"
        role="option"
        aria-selected={on}
        className={cn(
          "flex w-full flex-col rounded-md px-2 py-[5px] text-left",
          on && "bg-accent",
        )}
        title={
          option.kind === "page" || option.kind === "bib" || option.kind === "lookup"
            ? entryPlain(style, option.ref)
            : undefined
        }
        onMouseEnter={() => setSelected(at)}
        onClick={() => pick(option)}
      >
        <span className="block truncate font-medium">{title || "Untitled"}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </button>
    );
  };

  let at = 0;
  const rows = (list: Option[]) => list.map((option) => row(option, at++));

  return (
    <div
      ref={menuRef}
      role="listbox"
      aria-label="Cite a work"
      className="popover fixed z-30 flex max-h-[min(22rem,60vh)] w-[340px] flex-col text-[13px]"
      style={{ visibility: "hidden" }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {onPage.length > 0 && (
          <div role="group" aria-label="On this page">
            <div className={GROUP_HEAD}>On this page</div>
            {rows(onPage)}
          </div>
        )}
        {targets.length > 0 && (
          <div role="group" aria-label="Figures, tables and equations">
            <div className={GROUP_HEAD}>Figures, tables and equations</div>
            {rows(targets)}
          </div>
        )}
        {lookup && (
          <div role="group" aria-label={lookup.kind === "doi" ? "DOI" : "ISBN"}>
            <div className={GROUP_HEAD}>
              {lookup.kind === "doi" ? "Found by DOI" : "Found by ISBN"}
            </div>
            {rows(fromLookup)}
            {!lookedUp && (
              <p className={NOTE}>
                {lookup.kind === "doi" ? "Looking up the DOI…" : "Looking up the ISBN…"}
              </p>
            )}
            {lookedUp?.problem && <p className={NOTE}>{lookedUp.problem}</p>}
            {lookedUp?.ref && !fromLookup.length && (
              <p className={NOTE}>The page has this work already.</p>
            )}
          </div>
        )}
        {hasZotero && (fromZotero.length > 0 || current) && (
          <div role="group" aria-label="Zotero">
            <div className={GROUP_HEAD}>Zotero</div>
            {rows(fromZotero)}
            {current && fromZotero.length === 0 && !lookup && (
              <p className={NOTE}>
                {current.problem ??
                  (query ? `Nothing in Zotero matches “${query}”.` : "Type to search Zotero.")}
              </p>
            )}
          </div>
        )}
        {hasBib && fromBib.length > 0 && (
          <div role="group" aria-label="BibTeX">
            <div className={GROUP_HEAD}>BibTeX</div>
            {rows(fromBib)}
          </div>
        )}
        {hasBib && !hasZotero && current && fromBib.length === 0 && !lookup && (
          <p className={NOTE}>
            {current.problem ??
              (query
                ? `Nothing in your BibTeX files matches “${query}”.`
                : "Type to search your BibTeX files.")}
          </p>
        )}
        {searching && fromZotero.length === 0 && fromBib.length === 0 && (
          <p className={NOTE}>Searching…</p>
        )}
        {!hasSources && !lookup && (
          <div className="flex flex-col items-start gap-2 px-2 py-2.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <BookMarked className="size-3.5" aria-hidden />
              Connect Zotero or add a BibTeX file to cite works from your library, or
              type a DOI or an ISBN.
            </span>
            <button
              type="button"
              className="inline-flex h-6 items-center gap-1.5 rounded-[5px] border bg-background px-2 font-medium text-foreground hover:bg-muted"
              onClick={() => {
                controller.close();
                openReferenceSettings();
              }}
            >
              <Settings className="size-3.5" aria-hidden />
              Open settings
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-none justify-between border-t px-3 py-1.5 text-2xs text-muted-foreground">
        <span>↑↓ to choose, ↵ to cite</span>
        <span>Esc to close</span>
      </div>
    </div>
  );
}
