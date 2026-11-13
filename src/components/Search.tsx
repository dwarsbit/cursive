import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  Search as SearchIcon,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { findTarget, onFindTarget, type FindQuery, type FindState } from "@cursive/editor/lib/find";
import { parentOf } from "@/lib/project";
import { searchProject, type SearchResult } from "@cursive/editor/lib/search";
import { cn } from "@cursive/editor/lib/cn";

/**
 * Search across the project's pages: titles and text, case and accents
 * aside. Choosing a result opens the page with the find bar on what
 * was searched.
 */
export function SearchDialog({
  pages,
  initial = "",
  onOpen,
  onClose,
}: {
  pages: Record<string, string>;
  initial?: string;
  onOpen: (path: string, query: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initial);
  const [selected, setSelected] = useState(0);
  const results = useMemo(() => searchProject(pages, query), [pages, query]);
  const index = Math.min(selected, Math.max(0, results.length - 1));

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index, query]);

  const pick = (result: SearchResult) => onOpen(result.path, query.trim());

  return (
    <dialog
      ref={ref}
      className="confirm search-dialog"
      aria-label="Search the project"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="flex h-11 items-center gap-2 border-b px-3">
        <SearchIcon className="size-4 flex-none text-muted-foreground" aria-hidden />
        <input
          autoFocus
          value={query}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
          placeholder="Pilot study"
          aria-label="Search the project"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="search-results"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && results.length) {
              event.preventDefault();
              setSelected((index + 1) % results.length);
            } else if (event.key === "ArrowUp" && results.length) {
              event.preventDefault();
              setSelected((index + results.length - 1) % results.length);
            } else if (event.key === "Enter" && results[index]) {
              event.preventDefault();
              pick(results[index]);
            }
          }}
        />
      </div>
      <div
        ref={list}
        id="search-results"
        role="listbox"
        aria-label="Pages"
        className="max-h-[min(26rem,60vh)] overflow-y-auto p-1"
      >
        {query.trim() && results.length === 0 && (
          <p className="px-3 py-3 text-[13px] text-muted-foreground">
            No pages match “{query.trim()}”
          </p>
        )}
        {!query.trim() && (
          <p className="px-3 py-3 text-[13px] text-muted-foreground">
            Search the titles and text of every page.
          </p>
        )}
        {results.map((result, at) => {
          const folder = parentOf(result.path);
          return (
            <button
              key={result.path}
              type="button"
              role="option"
              aria-selected={at === index}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left",
                at === index && "bg-accent",
              )}
              onMouseEnter={() => setSelected(at)}
              onClick={() => pick(result)}
            >
              <span className="flex w-full items-center gap-2 text-[13px] font-medium">
                <FileText className="size-3.5 flex-none text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{result.title}</span>
                {folder && (
                  <span className="max-w-[40%] flex-none truncate text-2xs font-normal text-muted-foreground">
                    {folder}
                  </span>
                )}
                {result.count > 1 && (
                  <span className="flex-none text-2xs font-normal text-muted-foreground tabular-nums">
                    {result.count} matches
                  </span>
                )}
              </span>
              {result.excerpts.map((excerpt, line) => (
                <span
                  key={line}
                  className="block truncate pl-5.5 text-xs text-muted-foreground"
                >
                  {excerpt.before}
                  <mark className="search-hit">{excerpt.match}</mark>
                  {excerpt.after}
                </span>
              ))}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between border-t px-3 py-1.5 text-2xs text-muted-foreground">
        <span>↑↓ to choose, ↵ to open</span>
        <span>Esc to close</span>
      </div>
    </dialog>
  );
}

const ICON_BUTTON =
  "inline-flex size-6 flex-none items-center justify-center rounded-[5px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent";

/** The bar that finds text in the open page, and replaces it. */
export function FindBar({
  text: initial,
  replacing: replacingAtFirst,
  onClose,
}: {
  text: string;
  replacing: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replacing, setReplacing] = useState(replacingAtFirst);
  const [state, setState] = useState<FindState>({ count: 0, current: -1 });
  const [replaced, setReplaced] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // A new text to find, from the search or Cmd/Ctrl + F with a selection.
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setText(initial);
  }

  /** Marks what matches in the page, and shows the first match. */
  const run = (query: FindQuery) => {
    const target = findTarget();
    if (!target) return;
    const found = target.find(query);
    setState(found.count ? target.move(0) : found);
  };
  const latest = useRef({ text, caseSensitive });
  useEffect(() => {
    latest.current = { text, caseSensitive };
  });
  // Again when the bar opens with a text, and when another page or slide opens.
  useEffect(() => {
    const frame = requestAnimationFrame(() => run(latest.current));
    const stop = onFindTarget(() => run(latest.current));
    return () => {
      cancelAnimationFrame(frame);
      stop();
    };
  }, [initial]);
  useEffect(() => () => findTarget()?.clear(), []);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [initial]);

  const target = findTarget();
  const move = (step: 1 | -1) => {
    const current = findTarget();
    if (current) setState(current.move(step));
  };
  const close = () => {
    findTarget()?.clear();
    onClose();
  };

  const label =
    !text ? "" : state.count === 0 ? "No matches" : `${state.current + 1} of ${state.count}`;

  return (
    <div className="find-bar" role="search" aria-label="Find in page">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label={replacing ? "Hide replace" : "Show replace"}
          aria-expanded={replacing}
          title={replacing ? "Hide replace" : "Replace"}
          onClick={() => setReplacing(!replacing)}
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform", replacing && "rotate-90")}
            aria-hidden
          />
        </button>
        <input
          ref={input}
          value={text}
          className="find-field"
          placeholder="Find"
          aria-label="Find"
          onChange={(event) => {
            setText(event.target.value);
            setReplaced(null);
            run({ text: event.target.value, caseSensitive });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              move(event.shiftKey ? -1 : 1);
            } else if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
        />
        <span className="w-[72px] flex-none text-right text-2xs text-muted-foreground tabular-nums" role="status">
          {label}
        </span>
        <button
          type="button"
          className={cn(ICON_BUTTON, caseSensitive && "bg-tint-soft text-tint-foreground")}
          aria-pressed={caseSensitive}
          aria-label="Match case"
          title="Match case"
          onClick={() => {
            setCaseSensitive(!caseSensitive);
            run({ text, caseSensitive: !caseSensitive });
          }}
        >
          <CaseSensitive className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label="Previous match"
          title="Previous match (Shift + Enter)"
          disabled={!state.count}
          onClick={() => move(-1)}
        >
          <ChevronUp className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label="Next match"
          title="Next match (Enter)"
          disabled={!state.count}
          onClick={() => move(1)}
        >
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className={ICON_BUTTON}
          aria-label="Close"
          title="Close (Esc)"
          onClick={close}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      {replacing && (
        <div className="mt-1 flex items-center gap-1 pl-7">
          <input
            value={replacement}
            className="find-field"
            placeholder="Replace"
            aria-label="Replace with"
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && target && state.count) {
                event.preventDefault();
                setState(target.replace(replacement));
              } else if (event.key === "Escape") {
                event.preventDefault();
                close();
              }
            }}
          />
          <button
            type="button"
            className="h-6 flex-none rounded-[5px] border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
            disabled={!state.count}
            onClick={() => target && setState(target.replace(replacement))}
          >
            Replace
          </button>
          <button
            type="button"
            className="h-6 flex-none rounded-[5px] border bg-background px-2 text-xs font-medium hover:bg-muted disabled:opacity-50"
            disabled={!state.count}
            onClick={() => {
              if (!target) return;
              const count = target.replaceAll(replacement);
              setReplaced(count);
              setState(target.find({ text, caseSensitive }));
            }}
          >
            Replace all
          </button>
        </div>
      )}
      {replaced !== null && (
        <p className="mt-1 pl-7 text-2xs text-muted-foreground" role="status">
          {replaced === 1 ? "Replaced 1 match" : `Replaced ${replaced} matches`}
        </p>
      )}
    </div>
  );
}
