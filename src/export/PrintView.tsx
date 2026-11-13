import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PagePathProvider } from "@cursive/editor/lib/workspace";
import { ReferencesProvider } from "@cursive/editor/references/context";
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

/** A part's Markdown, for the references its citations name. */
const partMarkdown = (part: Part): string =>
  part.kind === "slides"
    ? part.slides.map((slide) => slide.body).join("\n\n")
    : part.markdown;

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
      // Images come from the project a moment later, and load after that.
      for (let waited = 0; waited < 5_000; waited += 100) {
        if (!root.current?.querySelector(".media-loading")) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await Promise.all(
        [...(root.current?.querySelectorAll("img") ?? [])].map((img) =>
          img.decode().catch(() => {}),
        ),
      );
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
      {job.parts.map((part) => (
        <PagePathProvider key={part.path} value={part.path}>
          {part.kind === "slides" && job.format === "slides" ? (
            <ReferencesProvider markdown={partMarkdown(part)} style={part.style}>
              <Slides part={part} notes={false} />
            </ReferencesProvider>
          ) : (
            <ReferencesProvider markdown={partMarkdown(part)} style={part.style}>
              <section className="print-part">
                <h1 className="print-title">{part.title}</h1>
                {part.kind === "slides" ? (
                  <Slides part={part} notes={job.notes} />
                ) : (
                  <PrintDoc markdown={part.markdown} />
                )}
              </section>
            </ReferencesProvider>
          )}
        </PagePathProvider>
      ))}
    </div>,
    document.body,
  );
}
