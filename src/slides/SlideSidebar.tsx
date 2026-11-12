import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { slideTitle } from "./deck";
import { SlideView } from "./SlideView";
import type { Deck } from "./use-deck";

/** The presentation's slides as small pictures: pick one, add, delete, drag to reorder. */
export function SlideSidebar({
  deck,
  title,
  onTitle,
  onTitleDone,
  onBack,
}: {
  deck: Deck;
  /** The presentation's title as typed, also while it is empty. */
  title: string;
  onTitle: (title: string) => void;
  onTitleDone: () => void;
  /** Shows the project's pages again. */
  onBack: () => void;
}) {
  const [dragged, setDragged] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    list.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [deck.index]);

  const count = deck.slides.length;
  return (
    <aside className="sidebar" aria-label="Presentation">
      <div className="flex h-9 items-center gap-1 px-1">
        <button
          type="button"
          aria-label="Back to pages"
          title="Back to pages"
          onClick={onBack}
          className="grid size-6 flex-none place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
        </button>
        <input
          value={title}
          placeholder="Untitled"
          aria-label="Presentation title"
          onChange={(event) => onTitle(event.target.value)}
          onBlur={onTitleDone}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-7 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-sm font-semibold outline-none placeholder:text-muted-foreground/60 hover:bg-accent focus:bg-background focus:shadow-[0_0_0_1px_var(--ring)]"
        />
      </div>

      <div className="flex h-6 items-center justify-between px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
        <span>
          Slides <span className="ml-1 text-2xs tabular-nums">{count}</span>
        </span>
        <button
          type="button"
          aria-label="New slide"
          title="New slide"
          onClick={deck.add}
          className="grid size-6 place-items-center rounded-md hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>

      <ol ref={list} className="thumbs">
        {deck.slides.map((slide, index) => {
          const current = index === deck.index;
          const name = slideTitle(slide) || "Empty slide";
          return (
            <li
              key={index}
              draggable
              className={cn(
                "thumb group",
                current && "thumb-active",
                dragged === index && "opacity-40",
                target === index &&
                  dragged !== null &&
                  dragged !== index &&
                  "thumb-drop",
              )}
              onDragStart={(event) => {
                setDragged(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(index));
              }}
              onDragOver={(event) => {
                if (dragged === null) return;
                event.preventDefault();
                setTarget(index);
              }}
              onDragEnd={() => {
                setDragged(null);
                setTarget(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged !== null) deck.move(dragged, index);
                setDragged(null);
                setTarget(null);
              }}
            >
              <span className="thumb-number">{index + 1}</span>
              <button
                type="button"
                aria-current={current}
                aria-label={`Slide ${index + 1}: ${name}`}
                onClick={() => deck.select(index)}
                className="thumb-frame"
              >
                <SlideView
                  layout={slide.layout}
                  small={slide.small}
                  body={slide.body}
                  footer={deck.title}
                  number={slide.layout === "title" ? undefined : index + 1}
                />
              </button>
              <button
                type="button"
                aria-label={`Delete slide ${index + 1}`}
                title="Delete slide"
                onClick={() => deck.remove(index)}
                className="thumb-delete"
              >
                <Trash2 className="size-3" aria-hidden />
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
