import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { SlideView } from "@/slides/SlideView";
import type { Slide } from "@/slides/deck";
import { pageRule, type ExportJob, type Part } from "./job";
import { PrintDoc } from "./PrintDoc";

function Slides({
  part,
  notes,
}: {
  part: Extract<Part, { kind: "slides" }>;
  notes: boolean;
}) {
  return part.slides.map((slide: Slide, index) => (
    <div key={index} className="print-slide">
      <SlideView
        layout={slide.layout}
        small={slide.small}
        body={slide.body}
        footer={part.title}
        number={slide.layout === "title" ? undefined : index + 1}
      />
      {notes && slide.notes.trim() && (
        <p className="print-notes">{slide.notes.trim()}</p>
      )}
    </div>
  ));
}

/**
 * What an export prints. It sits next to the app, out of sight on the
 * screen; on paper it is the only thing there. `onReady` is called once
 * every page is drawn, in the typefaces it is set in.
 */
export function PrintView({ job, onReady }: { job: ExportJob; onReady: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  });

  useEffect(() => {
    let current = true;
    const settle = async () => {
      // Blocks drawn by the editor arrive a moment after the page itself.
      await new Promise((resolve) => setTimeout(resolve, 150));
      await document.fonts?.ready;
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      if (!current) return;
      // On paper nothing opens: a closed toggle shows what is in it.
      root.current
        ?.querySelectorAll('[data-type="detailsContent"][hidden]')
        .forEach((content) => content.removeAttribute("hidden"));
      ready.current();
    };
    void settle();
    return () => {
      current = false;
    };
  }, [job]);

  return createPortal(
    <div ref={root} className={`print-root print-${job.format}`} aria-hidden>
      <style>{pageRule(job.format)}</style>
      {job.contents && (
        <section className="print-cover">
          <h1 className="print-title">{job.name}</h1>
          <ul className="print-contents">
            {job.contents.map((line, index) => (
              <li
                key={index}
                className={line.folder ? "print-folder" : undefined}
                style={{ paddingLeft: `${line.depth * 18}px` }}
              >
                {line.label}
              </li>
            ))}
          </ul>
        </section>
      )}
      {job.parts.map((part) =>
        part.kind === "slides" && job.format === "slides" ? (
          <Slides key={part.path} part={part} notes={false} />
        ) : (
          <section key={part.path} className="print-part">
            <h1 className="print-title">{part.title}</h1>
            {part.kind === "slides" ? (
              <Slides part={part} notes={job.notes} />
            ) : (
              <PrintDoc markdown={part.markdown} />
            )}
          </section>
        ),
      )}
    </div>,
    document.body,
  );
}
