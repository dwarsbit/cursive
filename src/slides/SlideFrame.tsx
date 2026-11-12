import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { Slide } from "./deck";

/** A slide is laid out at this size and scaled to whatever shows it. */
export const SLIDE_WIDTH = 960;

/**
 * The 16:9 page around a slide's blocks. It is always laid out at the
 * same size and then scaled, so a slide that fits in the editor fits
 * in a thumbnail and on a projector too.
 */
export function SlideFrame({
  slide,
  footer,
  number,
  className,
  onOver,
  children,
}: {
  slide: Pick<Slide, "layout" | "small">;
  /** The presentation's title, shown small under every slide but a title slide. */
  footer?: string;
  number?: number;
  className?: string;
  /** Told whether the blocks are taller than the slide. */
  onOver?: (over: boolean) => void;
  children: React.ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const report = useRef(onOver);
  useEffect(() => {
    report.current = onOver;
  });

  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const scale = () =>
      element.style.setProperty(
        "--slide-scale",
        String(element.clientWidth / SLIDE_WIDTH),
      );
    scale();
    const observer = new ResizeObserver(scale);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = body.current;
    if (!element) return;
    let frameId = 0;
    const measure = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const doc = element.querySelector(".doc");
        const next = doc ? doc.scrollHeight > element.clientHeight + 1 : false;
        setOver(next);
        report.current?.(next);
      });
    };
    measure();
    const mutations = new MutationObserver(measure);
    mutations.observe(element, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    // Text set in a font that arrives later takes another amount of room.
    void document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(frameId);
      mutations.disconnect();
    };
  }, [slide.layout, slide.small]);

  return (
    <div ref={frame} className={cn("slide", over && "slide-over", className)}>
      <div
        className={cn(
          "slide-page",
          `slide-${slide.layout}`,
          slide.small && "slide-small",
        )}
      >
        <div ref={body} className="slide-body">
          {children}
        </div>
        {number !== undefined && (
          <div className="slide-foot" aria-hidden>
            <span className="truncate">{footer}</span>
            <span>{number}</span>
          </div>
        )}
      </div>
    </div>
  );
}
