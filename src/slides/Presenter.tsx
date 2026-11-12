import { useEffect, useRef, useState } from "react";
import { SlideView } from "./SlideView";
import type { Deck } from "./use-deck";

/** The presentation on the whole screen, one slide at a time. */
export function Presenter({ deck }: { deck: Deck }) {
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(deck.index);
  const last = deck.slides.length - 1;
  const at = Math.min(index, last);
  const slide = deck.slides[at];

  const close = useRef(() => {});
  useEffect(() => {
    close.current = () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      deck.select(at);
      deck.present(false);
    };
  });

  useEffect(() => {
    const element = root.current;
    element?.focus();
    // Full screen where the system allows it; the slide fills the window either way.
    void element?.requestFullscreen?.().catch(() => {});
    const onChange = () => {
      if (!document.fullscreenElement) close.current();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const step = (by: number) => setIndex(Math.max(0, Math.min(last, at + by)));

  return (
    <div
      ref={root}
      className="presenter"
      role="dialog"
      aria-modal
      aria-label="Presentation"
      tabIndex={-1}
      onClick={() => step(1)}
      onKeyDown={(event) => {
        const next = ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"];
        const previous = ["ArrowLeft", "ArrowUp", "PageUp", "Backspace"];
        if (next.includes(event.key)) step(1);
        else if (previous.includes(event.key)) step(-1);
        else if (event.key === "Home") setIndex(0);
        else if (event.key === "End") setIndex(last);
        else if (event.key === "Escape") close.current();
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <SlideView
        layout={slide.layout}
        small={slide.small}
        body={slide.body}
        footer={deck.title}
        number={slide.layout === "title" ? undefined : at + 1}
      />
      <button
        type="button"
        className="presenter-close"
        onClick={(event) => {
          event.stopPropagation();
          close.current();
        }}
      >
        Esc to exit
      </button>
      <span className="presenter-count" role="status">
        {at + 1} / {deck.slides.length}
      </span>
    </div>
  );
}
