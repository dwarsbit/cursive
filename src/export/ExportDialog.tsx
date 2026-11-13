import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BUTTON,
  Dialog,
  messageOf,
  PRIMARY_BUTTON,
  QUIET_BUTTON,
} from "@cursive/editor/components/Dialog";
import { isDesktop } from "@/lib/desktop-store";
import type { Project } from "@/lib/project";
import { buildJob, hasSlides, type ExportJob, type Scope } from "./job";
import { PrintView } from "./PrintView";

/** Opens the system's print window, where the reader saves the PDF. */
const print = (): Promise<void> =>
  isDesktop
    ? invoke<void>("print_window")
    : new Promise((resolve) => {
        window.print();
        resolve();
      });

/**
 * Exports the open page, or the whole project, as a PDF. The pages are
 * drawn out of sight and handed to the system's print window, which
 * saves them as a PDF.
 */
export function ExportDialog({
  project,
  active,
  presentation,
  onClose,
}: {
  project: Project;
  /** The open page's path. */
  active: string | null;
  /** The open page is a presentation. */
  presentation: boolean;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<Scope>(active ? "page" : "project");
  const [notes, setNotes] = useState(false);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [phase, setPhase] = useState<"choose" | "preparing" | "open">("choose");
  const [problem, setProblem] = useState<string | null>(null);
  const pages = Object.keys(project.pages).length;
  const slides = useMemo(
    () => hasSlides(project, active, scope),
    [project, active, scope],
  );

  // The PDF is named after what it holds: the print window suggests the window's title.
  const title = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (title.current !== null) document.title = title.current;
    },
    [],
  );

  // A print window that says when it closes ends the export.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (phase !== "open") return;
    const done = () => close.current();
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, [phase]);

  const start = () => {
    const next = buildJob(project, active, { scope, notes: slides && notes });
    if (!next) return;
    setProblem(null);
    setJob(next);
    setPhase("preparing");
  };

  const ready = () => {
    if (!job || phase !== "preparing") return;
    title.current ??= document.title;
    document.title = job.name;
    setPhase("open");
    print().catch((error: unknown) => {
      setProblem(messageOf(error));
      setPhase("choose");
      setJob(null);
    });
  };

  const options: Array<{ id: Scope; label: string }> = [
    ...(active
      ? [
          {
            id: "page" as const,
            label: presentation ? "This presentation" : "This page",
          },
        ]
      : []),
    {
      id: "project",
      label: `The whole project (${pages === 1 ? "1 page" : `${pages} pages`})`,
    },
  ];

  return (
    <Dialog title="Export as PDF" onClose={onClose}>
      {phase === "choose" ? (
        <>
          <fieldset className="mt-3 flex flex-col gap-1.5 text-[13px]">
            <legend className="sr-only">What to export</legend>
            {options.map((option) => (
              <label key={option.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="export-scope"
                  checked={scope === option.id}
                  onChange={() => setScope(option.id)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          {slides && (
            <label className="mt-3 flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={notes}
                onChange={(event) => setNotes(event.target.checked)}
              />
              <span>
                With speaker notes
                <span className="block text-xs text-muted-foreground">
                  {scope === "page"
                    ? "Without notes, each slide is one page. With notes, the slides go on paper with their notes under them."
                    : "The notes go under each slide."}
                </span>
              </span>
            </label>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Cursive opens the print window. Choose “Save as PDF” there.
          </p>
          {problem && (
            <p className="mt-2 text-[13px] text-destructive" role="alert">
              The print window couldn’t be opened: {problem}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={QUIET_BUTTON} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={PRIMARY_BUTTON} onClick={start}>
              Export
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-3 text-[13px] text-muted-foreground" role="status">
            {phase === "preparing"
              ? "Preparing the pages…"
              : "Choose “Save as PDF” in the print window."}
          </p>
          <div className="mt-4 flex justify-end">
            <button type="button" className={BUTTON} onClick={onClose}>
              {phase === "preparing" ? "Cancel" : "Done"}
            </button>
          </div>
        </>
      )}
      {job && <PrintView job={job} onReady={ready} />}
    </Dialog>
  );
}
