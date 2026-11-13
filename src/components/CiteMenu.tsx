import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import type { Editor, Range } from "@tiptap/core";
import { BookMarked, Settings } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CiteController, CiteState } from "@/editor/cite";
import { entryText } from "@/references/apa";
import { usePageReferences } from "@/references/context";
import {
  putReference,
  readBibliography,
  toBibliographyFence,
  writeBibliography,
  type Reference,
} from "@/references/reference";
import { activeSources, sourceName, useSources } from "@/references/sources";
import {
  libraryOf,
  searchZotero,
  zoteroReference,
  zoteroYear,
  type ZoteroItem,
  type ZoteroSource,
} from "@/references/zotero";
import { cn } from "@/lib/cn";
import { messageOf } from "./Dialog";

type Option =
  | { kind: "page"; ref: Reference }
  | { kind: "zotero"; item: ZoteroItem; source: ZoteroSource };

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

/** The works to cite under a typed `@`: the page's first, then Zotero's. */
export function CiteMenu({
  state,
  controller,
}: {
  state: CiteState;
  controller: CiteController;
}) {
  const { editor, query, range, rect } = state;
  const { refs, addElsewhere } = usePageReferences();
  const sources = useSources();
  const [found, setFound] = useState<{ query: string; options: Option[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [lastQuery, setLastQuery] = useState(query);
  const menuRef = useRef<HTMLDivElement>(null);

  if (query !== lastQuery) {
    setLastQuery(query);
    setSelected(0);
  }

  const hasSources = sources.some((source) => source.enabled);
  const onPage: Option[] = [...refs.values()]
    .filter((ref) => matches(ref, query))
    .slice(0, 5)
    .map((ref) => ({ kind: "page", ref }));
  const pageItems = new Set(
    onPage.map((o) => (o.kind === "page" ? o.ref.zotero?.item : "")),
  );
  const fromZotero = (found?.options ?? []).filter(
    (o) => o.kind === "zotero" && !pageItems.has(o.item.key),
  );
  const options = [...onPage, ...fromZotero];
  const searching = hasSources && found?.query !== query;
  const index = Math.min(selected, Math.max(0, options.length - 1));

  // Zotero is asked a moment after the typing rests.
  useEffect(() => {
    if (!hasSources) return;
    let current = true;
    const timer = setTimeout(() => {
      void (async () => {
        const all: Option[] = [];
        const seen = new Set<string>();
        let failure: string | null = null;
        for (const source of await activeSources()) {
          try {
            for (const item of await searchZotero(source, query)) {
              if (seen.has(item.key)) continue;
              seen.add(item.key);
              all.push({ kind: "zotero", item, source });
            }
          } catch (error) {
            failure = messageOf(error);
          }
        }
        if (!current) return;
        setFound({ query, options: all });
        setProblem(all.length ? null : failure);
      })();
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, hasSources]);

  const pick = (option: Option) => {
    controller.close();
    if (option.kind === "page") {
      insertCitation(editor, range, option.ref, addElsewhere);
      return;
    }
    const library = libraryOf(option.source);
    const known = [...refs.values()].find(
      (ref) => ref.zotero?.item === option.item.key,
    );
    const ref = known ?? zoteroReference(option.item, library, refs.keys());
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

  const several =
    new Set(fromZotero.map((o) => (o.kind === "zotero" ? o.source.id : ""))).size > 1;
  const row = (option: Option, at: number) => {
    const on = at === index;
    const title = option.kind === "page" ? option.ref.title : (option.item.title ?? "");
    const detail =
      option.kind === "page"
        ? `@${option.ref.key}`
        : [
            (option.item.creators ?? [])
              .map((c) => c.lastName || c.name || "")
              .filter(Boolean)
              .slice(0, 3)
              .join(", "),
            zoteroYear(option.item.date),
            several ? sourceName(option.source) : "",
          ]
            .filter(Boolean)
            .join(" · ");
    return (
      <button
        key={option.kind === "page" ? `p:${option.ref.key}` : `z:${option.item.key}`}
        type="button"
        role="option"
        aria-selected={on}
        className={cn(
          "flex w-full flex-col rounded-md px-2 py-[5px] text-left",
          on && "bg-accent",
        )}
        title={option.kind === "page" ? entryText(option.ref) : undefined}
        onMouseEnter={() => setSelected(at)}
        onClick={() => pick(option)}
      >
        <span className="block truncate font-medium">{title || "Untitled"}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </button>
    );
  };

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
            <div className="px-2 pt-2 pb-1 text-2xs font-medium text-muted-foreground">
              On this page
            </div>
            {onPage.map((option, at) => row(option, at))}
          </div>
        )}
        {hasSources && (fromZotero.length > 0 || !searching) && (
          <div role="group" aria-label="Zotero">
            <div className="px-2 pt-2 pb-1 text-2xs font-medium text-muted-foreground">
              Zotero
            </div>
            {fromZotero.map((option, at) => row(option, onPage.length + at))}
            {!searching && fromZotero.length === 0 && (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                {problem ??
                  (query
                    ? `Nothing in Zotero matches “${query}”.`
                    : "Type to search Zotero.")}
              </p>
            )}
          </div>
        )}
        {searching && fromZotero.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">Searching Zotero…</p>
        )}
        {!hasSources && (
          <div className="flex flex-col items-start gap-2 px-2 py-2.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <BookMarked className="size-3.5" aria-hidden />
              Connect Zotero to cite works from your library.
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
