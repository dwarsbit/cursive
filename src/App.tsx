import { useEffect, useMemo, useRef, useState } from "react";
import { Editor, type EditorChange } from "@/components/Editor";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { SAMPLE_MARKDOWN, SAMPLE_TITLE } from "@/editor/sample";
import { cn } from "@/lib/cn";
import {
  countWords,
  loadDraft,
  loadMode,
  saveDraft,
  saveMode,
  type Mode,
} from "@/lib/draft";
import { plainText, readPage, writePage, type Page } from "@/lib/page-file";

const initialPage: Page = loadDraft() ?? {
  title: SAMPLE_TITLE,
  properties: "",
  markdown: SAMPLE_MARKDOWN,
};
const initialMode = loadMode();

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "visual", label: "Visual", hint: "The page as blocks" },
  { id: "markdown", label: "Markdown", hint: "The page as its Markdown file" },
];

export default function App() {
  // The page lives here; each editor starts from it when its mode opens.
  const [page, setPage] = useState(initialPage);
  const [mode, setMode] = useState(initialMode);
  const [saved, setSaved] = useState(true);
  const focusEditor = useRef<(() => void) | null>(null);

  const update = (next: Page) => {
    setPage(next);
    setSaved(saveDraft(next));
  };

  const onVisualChange = (change: EditorChange) => {
    if (change.markdown !== page.markdown)
      update({ ...page, markdown: change.markdown });
  };

  const onSourceChange = (source: string) => {
    update(readPage(source));
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    saveMode(next);
  };

  // Cmd/Ctrl + / switches between the two modes. It is caught on the
  // way down, before an editor reads the keys as its own shortcut.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        switchMode(mode === "visual" ? "markdown" : "visual");
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode]);

  const words = useMemo(() => countWords(plainText(page.markdown)), [page.markdown]);
  const title = page.title.trim();
  useEffect(() => {
    document.title = title ? `${title} · Cursive` : "Cursive";
  }, [title]);

  return (
    <div className="flex h-full flex-col p-2">
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] bg-card shadow-[0_1px_2px_oklch(14.5%_0.008_326/5%),0_0_0_1px_var(--border)]">
        <header className="flex h-11 flex-none items-center gap-2 px-3 text-xs">
          <span
            aria-hidden
            className="grid size-[22px] flex-none place-items-center rounded-md bg-primary-fill font-serif text-sm font-semibold text-primary-foreground italic shadow-[inset_0_0_0_1px_var(--primary-edge)]"
          >
            C
          </span>
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 flex-1 items-center gap-1.5"
          >
            <span className="text-muted-foreground">Cursive</span>
            <span className="text-muted-foreground/60">/</span>
            <span className="truncate">{title || "Untitled"}</span>
          </nav>
          <div
            role="group"
            aria-label="Editor mode"
            className="inline-flex flex-none gap-0.5 rounded-[7px] bg-muted p-0.5"
          >
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={mode === item.id}
                title={`${item.hint} (Cmd/Ctrl + /)`}
                onClick={() => switchMode(item.id)}
                className={cn(
                  "h-6 rounded-[5px] px-2.5 text-xs font-medium",
                  mode === item.id
                    ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0_0_0/8%),0_0_0_1px_var(--border)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto" id="page-scroll">
          {mode === "visual" ? (
            <article className="page">
              <input
                className="page-title"
                value={page.title}
                placeholder="Untitled"
                aria-label="Page title"
                onChange={(event) => update({ ...page, title: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "ArrowDown") {
                    event.preventDefault();
                    focusEditor.current?.();
                  }
                }}
              />
              <Editor
                markdown={page.markdown}
                onChange={onVisualChange}
                focusRef={focusEditor}
              />
            </article>
          ) : (
            <MarkdownEditor source={writePage(page)} onChange={onSourceChange} />
          )}
        </div>

        <footer className="flex h-7 flex-none items-center gap-3.5 border-t px-3.5 text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
          <span className="inline-flex items-center gap-1.5" role="status">
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${saved ? "bg-success" : "bg-warning"}`}
            />
            {saved
              ? "Saved in this browser"
              : "Not saved: this browser's storage is full or off"}
          </span>
          <span className="flex-1" />
          <span>
            {words === 1 ? "1 word" : `${words.toLocaleString("en-US")} words`}
          </span>
        </footer>
      </main>
    </div>
  );
}
