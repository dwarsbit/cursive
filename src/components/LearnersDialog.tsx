import { useCallback, useEffect, useState } from "react";
import { BUTTON, Dialog, messageOf, QUIET_BUTTON } from "./Dialog";
import {
  handedInFilePath,
  type Learners,
  type SaveFile,
  type Server,
  type Submission,
} from "@/lib/server";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const count = (n: number, one: string, many: string) =>
  n === 1 ? `1 ${one}` : `${n} ${many}`;

const size = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} kB`;

/** A whole number from 0 to `max`, from what was typed. */
const within = (typed: string, max: number) =>
  Math.min(max, Math.max(0, Math.round(Number(typed)) || 0));

/**
 * One piece of handed-in work: its text and file, and the form that
 * grades it on the assignment's rubric, or with one score without one.
 */
function Work({
  work,
  saveFile,
  filePath,
  onGrade,
  onClear,
}: {
  work: Submission;
  saveFile: SaveFile;
  filePath: string;
  onGrade: (grade: { score?: number; criteria?: number[]; feedback: string }) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const { grade, rubric } = work;
  const onRubric = grade !== null && grade.criteria.length === rubric.length;
  const [criteria, setCriteria] = useState(() =>
    rubric.map((_, index) => (onRubric ? String(grade.criteria[index]) : "")),
  );
  const [score, setScore] = useState(grade ? String(grade.score) : "");
  const [feedback, setFeedback] = useState(grade?.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const label = `${work.title || "Assignment"}`;

  const run = (action: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    action()
      .catch((error: unknown) => setProblem(messageOf(error)))
      .finally(() => setBusy(false));
  };
  const total = rubric.reduce(
    (sum, criterion, index) => sum + within(criteria[index] ?? "", criterion.points),
    0,
  );

  return (
    <div className="work">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span> in {work.pageTitle} ·
        handed in {day(work.submittedAt)}
      </p>
      {work.text && <pre>{work.text}</pre>}
      {work.file && (
        <p className="file">
          <span className="name">{work.file.name}</span>
          <span className="text-muted-foreground">{size(work.file.size)}</span>
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            disabled={busy}
            onClick={() => run(() => saveFile(filePath, work.file!.name))}
          >
            Save file
          </button>
        </p>
      )}

      {work.points === null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          This assignment is no longer on the published site, so it can’t be graded.
        </p>
      ) : (
        <form
          className="grade"
          onSubmit={(event) => {
            event.preventDefault();
            run(() =>
              onGrade(
                rubric.length > 0
                  ? {
                      criteria: rubric.map((criterion, index) =>
                        within(criteria[index] ?? "", criterion.points),
                      ),
                      feedback,
                    }
                  : { score: within(score, work.points ?? 0), feedback },
              ),
            );
          }}
        >
          {rubric.map((criterion, index) => (
            <label key={index} className="line">
              <span className="grow">{criterion.criterion}</span>
              <input
                type="number"
                min={0}
                max={criterion.points}
                step={1}
                value={criteria[index] ?? ""}
                placeholder="0"
                aria-label={`Points for ${criterion.criterion}`}
                onChange={(event) =>
                  setCriteria((before) =>
                    before.map((value, at) => (at === index ? event.target.value : value)),
                  )
                }
              />
              <span className="of">of {criterion.points}</span>
            </label>
          ))}
          {rubric.length > 0 && (
            <p className="line font-medium">
              <span className="grow">Total</span>
              <span className="of">
                {total} of {work.points}
              </span>
            </p>
          )}
          {rubric.length === 0 && work.points > 0 && (
            <label className="line">
              <span className="grow">Points</span>
              <input
                type="number"
                min={0}
                max={work.points}
                step={1}
                value={score}
                placeholder="0"
                onChange={(event) => setScore(event.target.value)}
              />
              <span className="of">of {work.points}</span>
            </label>
          )}
          <textarea
            value={feedback}
            maxLength={10000}
            rows={2}
            placeholder="Feedback for the learner"
            aria-label={`Feedback on ${label}`}
            onChange={(event) => setFeedback(event.target.value)}
          />
          <div className="flex items-center gap-2">
            <button type="submit" className={BUTTON} disabled={busy}>
              {grade ? "Save grade again" : "Save grade"}
            </button>
            {grade && (
              <button
                type="button"
                className={QUIET_BUTTON}
                disabled={busy}
                onClick={() => run(onClear)}
              >
                Remove grade
              </button>
            )}
            <span className="text-xs text-muted-foreground" role="status">
              {grade
                ? `Graded ${day(grade.gradedAt)}. The learner sees it on the page.`
                : "Not graded yet."}
            </span>
          </div>
        </form>
      )}
      {problem && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * The readers who signed in to the published tutorial: how far each
 * one is, their points and the work they handed in, which the author
 * grades here.
 */
export function LearnersDialog({
  server,
  projectId,
  saveFile,
  onClose,
}: {
  server: Server;
  projectId: string;
  saveFile: SaveFile;
  onClose: () => void;
}) {
  const [data, setData] = useState<Learners | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    server.learners(projectId).then(
      (loaded) => current && setData(loaded),
      (error: unknown) => current && setProblem(messageOf(error)),
    );
    return () => {
      current = false;
    };
  }, [server, projectId]);
  /** After a grade changed: the list again, with the learner's new points. */
  const reload = useCallback(
    async () => setData(await server.learners(projectId)),
    [server, projectId],
  );

  return (
    <Dialog title="Learners" onClose={onClose}>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        Readers who signed in to your published tutorial. Readers who don’t sign in keep
        their progress in their own browser and are not listed.
      </p>

      {data && data.learners.length === 0 && (
        <p className="mt-3 text-[13px]">Nobody has signed in yet.</p>
      )}
      {data && data.learners.length > 0 && (
        <div className="learners">
          {data.learners.map((learner) => (
            <details key={learner.id}>
              <summary>
                <span className="who">
                  <span className="font-medium">{learner.name}</span>
                  <span className="text-xs text-muted-foreground">{learner.email}</span>
                </span>
                <span className="meta">
                  {learner.pagesDone} of {count(data.pages, "page", "pages")} ·{" "}
                  {learner.points} of {count(data.points, "point", "points")}
                  {learner.submissions.length > 0 &&
                    ` · ${count(learner.submissions.length, "assignment", "assignments")}`}
                </span>
              </summary>
              {learner.submissions.length === 0 ? (
                <p className="mb-2.5 text-xs text-muted-foreground">
                  No work handed in. Last active {day(learner.lastActiveAt)}.
                </p>
              ) : (
                learner.submissions.map((work) => (
                  <Work
                    key={`${work.page}#${work.assignment}#${work.submittedAt}#${work.grade?.gradedAt ?? ""}`}
                    work={work}
                    saveFile={saveFile}
                    filePath={handedInFilePath(projectId, learner.id, work)}
                    onGrade={async (grade) => {
                      await server.grade(projectId, learner.id, work, grade);
                      await reload();
                    }}
                    onClear={async () => {
                      await server.clearGrade(projectId, learner.id, work);
                      await reload();
                    }}
                  />
                ))
              )}
            </details>
          ))}
        </div>
      )}

      {!data && !problem && (
        <p className="mt-3 text-[13px] text-muted-foreground" role="status">
          Loading…
        </p>
      )}
      {problem && (
        <p className="mt-3 text-[13px] text-destructive" role="alert">
          {problem}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={BUTTON} onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}
