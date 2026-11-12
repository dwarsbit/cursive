import type { Editor as TiptapEditor } from "@tiptap/core";
import { Check, ChevronDown, LayoutTemplate, StickyNote } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Editor } from "@/components/Editor";
import { cn } from "@/lib/cn";
import { tidyMarkdown } from "@/lib/page-file";
import { LAYOUTS, splitBlocks, type Slide } from "./deck";
import { SlideFrame } from "./SlideFrame";
import type { Deck } from "./use-deck";

const TOOL =
  "inline-flex h-7 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium hover:bg-muted";

function LayoutMenu({ deck }: { deck: Deck }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const slide = deck.slides[deck.index];
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
      } else if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Layout, now ${LAYOUTS.find((l) => l.id === slide.layout)?.label}`}
        onClick={() => setOpen(!open)}
        className={TOOL}
      >
        <LayoutTemplate className="size-3.5" aria-hidden />
        {LAYOUTS.find((layout) => layout.id === slide.layout)?.label}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Layout"
          className="popover absolute top-full left-0 z-20 mt-1.5 w-64 p-1 text-[13px]"
        >
          {LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              type="button"
              role="menuitemradio"
              aria-checked={layout.id === slide.layout}
              onClick={() => {
                deck.patch({ layout: layout.id });
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{layout.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {layout.hint}
                </span>
              </span>
              {layout.id === slide.layout && (
                <Check className="size-3.5 flex-none text-tint" aria-hidden />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The slide being worked on, at full size: its blocks, its layout and its notes. */
export function SlideStage({ deck, opened }: { deck: Deck; opened: number }) {
  const slide = deck.slides[deck.index];
  const editor = useRef<TiptapEditor | null>(null);
  const focusEditor = useRef<(() => void) | null>(null);
  const [fit, setFit] = useState<{ key: string; over: boolean } | null>(null);
  const key = `${opened}:${deck.stamp}:${deck.index}`;
  const over = fit?.key === key && fit.over;

  const { focus } = deck;
  useEffect(() => {
    if (focus) focusEditor.current?.();
  }, [focus, key]);

  /** The stage's blocks as two slides, when they can be cut in two. */
  const split = (): [Slide, Slide] | null => {
    const tiptap = editor.current;
    const halves = tiptap && splitBlocks(tiptap.getJSON().content ?? []);
    if (!tiptap?.markdown || !halves) return null;
    const [first, second] = halves.map((content) =>
      tidyMarkdown(tiptap.markdown!.serialize({ type: "doc", content })),
    );
    return [
      { ...slide, body: first },
      { ...slide, body: second, notes: "" },
    ];
  };

  return (
    <div className="stage-wrap">
      <div className="stage">
        <div className="flex flex-wrap items-center gap-2">
          <LayoutMenu deck={deck} />
          <span className={cn("fit-pill", over && "fit-pill-over")} role="status">
            {over ? "Doesn’t fit the slide" : "Fits the slide"}
          </span>
          {over && (
            <>
              <button
                type="button"
                className={TOOL}
                onClick={() => {
                  const halves = split();
                  if (halves) deck.replace(halves, 0);
                }}
              >
                Split into two slides
              </button>
              {!slide.small && (
                <button
                  type="button"
                  className={TOOL}
                  onClick={() => deck.patch({ small: true })}
                >
                  Smaller text
                </button>
              )}
            </>
          )}
          {slide.small && !over && (
            <button
              type="button"
              className={TOOL}
              onClick={() => deck.patch({ small: false })}
            >
              Normal text
            </button>
          )}
        </div>

        <SlideFrame
          key={key}
          slide={slide}
          footer={deck.title}
          number={slide.layout === "title" ? undefined : deck.index + 1}
          onOver={(next) => setFit({ key, over: next })}
        >
          <Editor
            markdown={slide.body}
            onChange={(change) => deck.edit(change.markdown)}
            editorRef={editor}
            focusRef={focusEditor}
            inSlide
          />
        </SlideFrame>

        <label className="block rounded-lg bg-card px-3.5 pt-2.5 pb-3 shadow-[0_0_0_1px_var(--border)]">
          <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <StickyNote className="size-3.5" aria-hidden />
            Speaker notes
          </span>
          <textarea
            key={key}
            defaultValue={slide.notes}
            placeholder="What you want to say with this slide"
            rows={3}
            onChange={(event) => deck.patch({ notes: event.target.value })}
            className="block w-full resize-y bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70"
          />
        </label>
      </div>
    </div>
  );
}
