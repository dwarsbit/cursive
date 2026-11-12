import { useEffect, useState } from "react";
import { BUTTON, Dialog, messageOf } from "./Dialog";
import type { Learners, Server } from "@/lib/server";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const count = (n: number, one: string, many: string) =>
  n === 1 ? `1 ${one}` : `${n} ${many}`;

/**
 * The readers who signed in to the published tutorial: how far each
 * one is, their quiz points and the work they handed in.
 */
export function LearnersDialog({
  server,
  projectId,
  onClose,
}: {
  server: Server;
  projectId: string;
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
                  <div key={`${work.page}#${work.assignment}`} className="work">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {work.title || "Assignment"}
                      </span>{" "}
                      in {work.pageTitle} · handed in {day(work.submittedAt)}
                    </p>
                    <pre>{work.text}</pre>
                  </div>
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
