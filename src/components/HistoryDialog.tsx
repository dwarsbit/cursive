import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { diffCount, diffLines, type DiffLine } from "@/lib/diff";
import { snapshotTime, type PageHistory, type PageSnapshot } from "@/lib/page-history";
import { cn } from "@cursive/editor/lib/cn";

/** Unchanged lines shown around a change. */
const CONTEXT = 3;

type Row = DiffLine | { kind: "skip"; count: number };

/** The comparison with long runs of unchanged lines folded away. */
function foldUnchanged(lines: DiffLine[]): Row[] {
  const rows: Row[] = [];
  let run: DiffLine[] = [];
  const flush = (atStart: boolean, atEnd: boolean) => {
    const keepBefore = atStart ? 0 : CONTEXT;
    const keepAfter = atEnd ? 0 : CONTEXT;
    if (run.length <= keepBefore + keepAfter + 1) rows.push(...run);
    else {
      rows.push(...run.slice(0, keepBefore));
      rows.push({ kind: "skip", count: run.length - keepBefore - keepAfter });
      rows.push(...run.slice(run.length - keepAfter));
    }
    run = [];
  };
  let first = true;
  for (const line of lines) {
    if (line.kind === "same") {
      run.push(line);
      continue;
    }
    if (run.length) flush(first, false);
    first = false;
    rows.push(line);
  }
  if (run.length) flush(first, true);
  return rows;
}

/**
 * A page's snapshots: what each one changes compared with the page as
 * it is now, and a button to put one back.
 */
export function HistoryDialog({
  title,
  path,
  source,
  history,
  hourly,
  onRestore,
  onClose,
}: {
  title: string;
  path: string;
  /** The page's file as it is now. */
  source: string;
  history: PageHistory;
  /** Whether snapshots are taken each hour, as on the server, not each 10 minutes. */
  hourly: boolean;
  onRestore: (snapshot: PageSnapshot) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [snapshots, setSnapshots] = useState<PageSnapshot[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [whole, setWhole] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  useEffect(() => {
    let current = true;
    history.list(path).then(
      (found) => {
        if (current) setSnapshots(found.filter((snapshot) => snapshot.source !== source));
      },
      (error: unknown) => {
        if (current) setProblem(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      current = false;
    };
    // The list is read once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapshot =
    snapshots?.find((item) => item.id === selected) ?? snapshots?.[0] ?? null;
  // From the page now to the snapshot: what a restore takes out and brings back.
  const lines = useMemo(
    () => (snapshot ? diffLines(source, snapshot.source) : []),
    [snapshot, source],
  );
  const rows = useMemo(() => foldUnchanged(lines), [lines]);
  const counts = useMemo(
    () =>
      new Map(
        (snapshots ?? []).map((item) => [item.id, diffCount(diffLines(source, item.source))]),
      ),
    [snapshots, source],
  );

  const restore = async () => {
    if (!snapshot) return;
    setRestoring(true);
    try {
      await onRestore(snapshot);
      onClose();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      setRestoring(false);
    }
  };

  const every = hourly ? "each hour" : "at most every 10 minutes";

  return (
    <dialog
      ref={ref}
      className="confirm history-dialog"
      aria-labelledby="history-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="flex h-11 flex-none items-center gap-2 border-b px-4">
        <h2 id="history-title" className="min-w-0 flex-1 truncate text-sm font-semibold">
          History of “{title}”
        </h2>
        <button
          type="button"
          className="inline-flex size-6 items-center justify-center rounded-[5px] text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
          title="Close (Esc)"
          onClick={onClose}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>

      <div className="history-body">
        <div className="history-list" role="listbox" aria-label="Snapshots">
          {snapshots === null && !problem && (
            <p className="px-2.5 py-2 text-xs text-muted-foreground" role="status">
              Loading snapshots…
            </p>
          )}
          {snapshots?.length === 0 && (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">No snapshots yet</p>
              <p className="mt-1">
                Cursive keeps one while you write, {every}.
              </p>
            </div>
          )}
          {snapshots?.map((item) => {
            const count = counts.get(item.id);
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item === snapshot}
                className={cn(
                  "flex w-full flex-col rounded-md px-2.5 py-1.5 text-left",
                  item === snapshot ? "bg-accent" : "hover:bg-muted",
                )}
                onClick={() => setSelected(item.id)}
              >
                <span className="text-[13px] font-medium tabular-nums">
                  {snapshotTime(item.at)}
                </span>
                {count && (
                  <span className="text-2xs text-muted-foreground tabular-nums">
                    {count.added + count.removed === 1
                      ? "1 line differs"
                      : `${count.added + count.removed} lines differ`}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="history-view">
          {snapshot && (
            <div className="flex h-9 flex-none items-center gap-3 border-b px-3 text-2xs text-muted-foreground">
              <div
                role="group"
                aria-label="Show"
                className="inline-flex flex-none gap-0.5 rounded-[7px] bg-muted p-0.5"
              >
                {[
                  { id: false, label: "Changes" },
                  { id: true, label: "Whole snapshot" },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    aria-pressed={whole === item.id}
                    onClick={() => setWhole(item.id)}
                    className={cn(
                      "h-5 rounded-[5px] px-2 text-2xs font-medium",
                      whole === item.id
                        ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0_0_0/8%),0_0_0_1px_var(--border)]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {!whole && (
                <span className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="diff-swatch diff-added" aria-hidden />
                    Comes back
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="diff-swatch diff-removed" aria-hidden />
                    Goes away
                  </span>
                </span>
              )}
            </div>
          )}
          <div className="history-lines" aria-label="Snapshot">
            {problem && <p className="p-3 text-xs text-destructive">{problem}</p>}
            {snapshot &&
              (whole
                ? snapshot.source.split("\n").map((text, index) => (
                    <div key={index} className="diff-line">
                      <span className="diff-sign" aria-hidden />
                      {text || " "}
                    </div>
                  ))
                : rows.map((row, index) =>
                    row.kind === "skip" ? (
                      <div key={index} className="diff-skip">
                        {row.count === 1 ? "1 unchanged line" : `${row.count} unchanged lines`}
                      </div>
                    ) : (
                      <div key={index} className={cn("diff-line", `diff-${row.kind}`)}>
                        <span className="diff-sign" aria-hidden>
                          {row.kind === "added" ? "+" : row.kind === "removed" ? "−" : " "}
                        </span>
                        <span className="sr-only">
                          {row.kind === "added" ? "Comes back: " : row.kind === "removed" ? "Goes away: " : ""}
                        </span>
                        {row.text || " "}
                      </div>
                    ),
                  ))}
          </div>
        </div>
      </div>

      <div className="flex flex-none items-center justify-end gap-2 border-t px-4 py-3">
        <p className="mr-auto text-2xs text-muted-foreground">
          {snapshot ? "The page as it is now is kept as a snapshot." : ""}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-md border bg-background px-3 text-[13px] font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!snapshot || restoring}
          onClick={() => void restore()}
          className="h-8 rounded-md border border-primary-edge bg-primary-fill px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary-fill/85 disabled:opacity-50"
        >
          {restoring ? "Restoring…" : "Restore snapshot"}
        </button>
      </div>
    </dialog>
  );
}
