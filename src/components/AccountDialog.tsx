import { useEffect, useState } from "react";
import { BUTTON, Dialog, messageOf, PRIMARY_BUTTON } from "@cursive/editor/components/Dialog";
import type { ServerProject } from "@/lib/server";

/** What the dialog is for, once signed in. */
export type AccountAsk = "sign-in" | "sync" | "projects";

/**
 * The desktop app's account dialog. Signed out, it signs in. Signed
 * in, it does what it was opened for: sync the open project with the
 * account, or open a project from the account.
 */
export function AccountDialog({
  ask,
  signedIn,
  note,
  onSignIn,
  onCancelSignIn,
  onLink,
  listProjects,
  onOpenProject,
  onClose,
}: {
  ask: AccountAsk;
  signedIn: boolean;
  /** Why the dialog opened by itself, such as on Publish. */
  note?: string;
  onSignIn: (create: boolean) => Promise<void>;
  onCancelSignIn: () => void;
  onLink: () => Promise<void>;
  listProjects: () => Promise<ServerProject[]>;
  onOpenProject: (project: ServerProject) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<"sign-in" | "work" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [projects, setProjects] = useState<ServerProject[] | null>(null);

  const run = async (kind: "sign-in" | "work", work: () => Promise<void>) => {
    setBusy(kind);
    setProblem(null);
    try {
      await work();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(null);
    }
  };

  const listing = signedIn && ask === "projects";
  useEffect(() => {
    if (!listing) return;
    let current = true;
    listProjects().then(
      (found) => current && setProjects(found),
      (error: unknown) => current && setProblem(messageOf(error)),
    );
    return () => {
      current = false;
    };
    // The list is fetched once, when the dialog gets to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing]);

  const title = !signedIn
    ? "Sign in to Polemic"
    : ask === "projects"
      ? "Open from your account"
      : "Sync this project";

  return (
    <Dialog title={title} onClose={onClose}>
      {note && <p className="mt-1.5 text-[13px]">{note}</p>}

      {!signedIn ? (
        <>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {busy === "sign-in"
              ? "Finish signing in in your browser, then come back here."
              : "Sign in to sync a project with your account, open it on another computer or in a browser, and publish it as a site. Cursive uses your Polemic account."}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            {busy === "sign-in" ? (
              <button type="button" className={BUTTON} onClick={onCancelSignIn}>
                Cancel
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => void run("sign-in", () => onSignIn(true))}
                >
                  Create account
                </button>
                <button
                  type="button"
                  className={PRIMARY_BUTTON}
                  onClick={() => void run("sign-in", () => onSignIn(false))}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </>
      ) : ask === "projects" ? (
        <>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Choose a project. It gets a folder in your Cursive folder and syncs with
            your account.
          </p>
          {!projects ? (
            !problem && (
              <p className="mt-3 text-[13px] text-muted-foreground" role="status">
                Loading your projects…
              </p>
            )
          ) : projects.length === 0 ? (
            <p className="mt-3 text-[13px]">
              Your account has no Cursive projects yet.
            </p>
          ) : (
            <ul className="mt-3 max-h-60 overflow-y-auto rounded-md border">
              {projects.map((project) => (
                <li key={project.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void run("work", () => onOpenProject(project))}
                    className="flex h-7 w-full items-center px-2 text-left text-[13px] hover:bg-muted"
                  >
                    <span className="truncate">{project.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex justify-end">
            <button type="button" className={BUTTON} onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            A synced project is in your account too: you can open it on another computer
            or in a browser, and publish it as a site.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={BUTTON} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={busy !== null}
              onClick={() => void run("work", onLink)}
            >
              Sync to your account
            </button>
          </div>
        </>
      )}

      {problem && (
        <p className="mt-3 text-[13px] text-destructive" role="alert">
          {problem}
        </p>
      )}
    </Dialog>
  );
}
