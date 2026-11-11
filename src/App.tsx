import { useEffect, useRef, useState } from "react";
import { Editor, type EditorChange } from "@/components/Editor";
import { SAMPLE_MARKDOWN, SAMPLE_TITLE } from "@/editor/sample";
import { countWords, loadDraft, saveDraft } from "@/lib/draft";

const initial = loadDraft() ?? { title: SAMPLE_TITLE, markdown: SAMPLE_MARKDOWN };

export default function App() {
  const [title, setTitle] = useState(initial.title);
  const [words, setWords] = useState(0);
  const [saved, setSaved] = useState(true);
  const markdown = useRef(initial.markdown);
  const focusEditor = useRef<(() => void) | null>(null);

  const store = (nextTitle: string) =>
    setSaved(saveDraft({ title: nextTitle, markdown: markdown.current }));

  const onChange = (change: EditorChange) => {
    markdown.current = change.markdown;
    setWords(countWords(change.text));
    store(title);
  };

  useEffect(() => {
    document.title = title.trim() ? `${title.trim()} · Cursive` : "Cursive";
  }, [title]);

  return (
    <div className="flex h-full flex-col p-2">
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] bg-card shadow-[0_1px_2px_oklch(14.5%_0.008_326/5%),0_0_0_1px_var(--border)]">
        <header className="flex h-11 flex-none items-center gap-2 px-3 text-xs">
          <span
            aria-hidden
            className="grid size-[22px] place-items-center rounded-md bg-primary-fill font-serif text-sm font-semibold text-primary-foreground italic shadow-[inset_0_0_0_1px_var(--primary-edge)]"
          >
            C
          </span>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
            <span className="text-muted-foreground">Cursive</span>
            <span className="text-muted-foreground/60">/</span>
            <span className="truncate">{title.trim() || "Untitled"}</span>
          </nav>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto" id="page-scroll">
          <article className="page">
            <input
              className="page-title"
              value={title}
              placeholder="Untitled"
              aria-label="Page title"
              onChange={(event) => {
                setTitle(event.target.value);
                store(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "ArrowDown") {
                  event.preventDefault();
                  focusEditor.current?.();
                }
              }}
            />
            <Editor
              markdown={initial.markdown}
              onChange={onChange}
              focusRef={focusEditor}
            />
          </article>
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
