import type { AnyExtension, Node as TiptapNode } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { RefreshCw, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  citationText,
  entryText,
  referenceEntry,
  sortReferences,
  type Run,
} from "@/references/apa";
import { usePageReferences, type ReferenceState } from "@/references/context";
import {
  readBibliography,
  writeBibliography,
  type CiteItem,
  type Reference,
} from "@/references/reference";
import { cn } from "@/lib/cn";

export function Runs({ runs }: { runs: Run[] }) {
  return runs.map((run, index) =>
    run.italic ? <i key={index}>{run.text}</i> : <span key={index}>{run.text}</span>,
  );
}

/** What a warning says about a reference. */
export function stateText(state: ReferenceState | undefined, missing = false): string {
  if (missing) return "The page has no reference with this key.";
  if (state?.state === "changed") return "This work changed in Zotero.";
  if (state?.state === "missing") return "This work is no longer in Zotero.";
  return "";
}

/**
 * A citation in the text, in APA style, marked when its work needs a
 * look. Clicking it opens the pages it cites, to fill in or change.
 */
export function CitationView({
  node,
  selected,
  editor,
  updateAttributes,
}: ReactNodeViewProps) {
  const { refs, states } = usePageReferences();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const items = node.attrs.items as CiteItem[];
  const unknown = items.some((item) => !refs.has(item.key));
  const warn = unknown || items.some((item) => states.has(item.key));
  const title = items
    .map((item) => {
      const ref = refs.get(item.key);
      const note = stateText(states.get(item.key), !ref);
      return [ref ? entryText(ref) : `@${item.key}`, note].filter(Boolean).join("\n");
    })
    .join("\n\n");

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !root.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const setLocator = (index: number, locator: string) =>
    updateAttributes({
      items: items.map((item, i) => (i === index ? { ...item, locator } : item)),
    });

  return (
    <NodeViewWrapper
      as="span"
      ref={root}
      className={cn("citation", warn && "citation-warn", selected && "is-selected")}
      title={open ? undefined : title}
      onClick={() => {
        if (editor.isEditable) setOpen(true);
      }}
    >
      {citationText(items, refs)}
      {warn && <TriangleAlert className="citation-mark" aria-label="Needs a look" />}
      {open && (
        <span
          className="popover cite-popover"
          contentEditable={false}
          role="dialog"
          aria-label="Citation"
        >
          {items.map((item, index) => {
            const ref = refs.get(item.key);
            return (
              <span key={`${item.key}:${index}`} className="cite-row">
                <span className="cite-work">
                  {ref ? entryText(ref) : `@${item.key}`}
                </span>
                {stateText(states.get(item.key), !ref) && (
                  <span className="cite-note">
                    {stateText(states.get(item.key), !ref)}
                  </span>
                )}
                <label className="cite-field">
                  Pages
                  <input
                    value={item.locator}
                    placeholder="p. 4"
                    autoFocus={index === 0}
                    onChange={(event) => setLocator(index, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setOpen(false);
                    }}
                  />
                </label>
              </span>
            );
          })}
        </span>
      )}
    </NodeViewWrapper>
  );
}

/**
 * The reference list: every work the page keeps, in APA style. Where
 * the page is edited, a work that changed in Zotero can be brought up
 * to date or kept as it is, and a work no citation names any more can
 * be removed.
 */
export function BibliographyView({
  node,
  updateAttributes,
  editor,
  selected,
}: ReactNodeViewProps) {
  const { states, cited, checking, problem, check } = usePageReferences();
  const editable = editor.isEditable;
  const source = node.attrs.source as string;
  const refs = readBibliography(source) ?? [];
  const write = (next: Reference[]) =>
    updateAttributes({ source: writeBibliography(next) });
  const replace = (ref: Reference) =>
    write(refs.map((other) => (other.key === ref.key ? ref : other)));
  const linked = refs.some((ref) => ref.zotero);

  return (
    <NodeViewWrapper
      className={cn("bibliography", selected && "is-selected")}
      contentEditable={false}
    >
      <div className="bib-head">
        <h2>References</h2>
        {editable && linked && (
          <button
            type="button"
            className="bib-action"
            disabled={checking}
            title="Compare these works with Zotero"
            onClick={check}
          >
            <RefreshCw className={cn(checking && "animate-spin")} aria-hidden />
            {checking ? "Checking…" : "Check Zotero"}
          </button>
        )}
      </div>
      {editable && problem && <p className="bib-problem">{problem}</p>}
      {refs.length === 0 ? (
        <p className="bib-empty">
          {editable
            ? "No references yet. Type @ in the text to cite a work from Zotero."
            : ""}
        </p>
      ) : (
        <ol className="bib-list">
          {sortReferences(refs).map((ref) => {
            const state = editable ? states.get(ref.key) : undefined;
            const unused = editable && !cited.has(ref.key);
            return (
              <li key={ref.key} className={cn(state && "bib-warn")}>
                <p className="bib-entry">
                  <Runs runs={referenceEntry(ref)} />
                </p>
                {state && (
                  <div className="bib-note" role="status">
                    <TriangleAlert aria-hidden />
                    <span>{stateText(state)}</span>
                    {state.state === "changed" && (
                      <button type="button" onClick={() => replace(state.fresh)}>
                        Update from Zotero
                      </button>
                    )}
                    <button
                      type="button"
                      title={
                        state.state === "changed"
                          ? "Keep this copy and stop the warning until the work changes again"
                          : "Keep this copy and no longer compare it with Zotero"
                      }
                      onClick={() =>
                        replace(
                          state.state === "changed"
                            ? { ...ref, zotero: state.fresh.zotero }
                            : { ...ref, zotero: null },
                        )
                      }
                    >
                      Keep my copy
                    </button>
                  </div>
                )}
                {unused && !state && (
                  <div className="bib-note bib-quiet">
                    <span>Not cited on this page.</span>
                    <button
                      type="button"
                      onClick={() =>
                        write(refs.filter((other) => other.key !== ref.key))
                      }
                    >
                      <X aria-hidden />
                      Remove
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </NodeViewWrapper>
  );
}

/** Draws citations and bibliographies in an editor that shows a page, not one that edits it. */
export const withReferenceViews = (extensions: AnyExtension[]): AnyExtension[] =>
  extensions.map((extension) => {
    const view =
      extension.name === "citation"
        ? CitationView
        : extension.name === "bibliography"
          ? BibliographyView
          : null;
    if (!view || extension.type !== "node") return extension;
    return (extension as TiptapNode).extend({
      addNodeView() {
        return ReactNodeViewRenderer(view);
      },
    });
  });
