import { useState } from "react";
import { BUTTON, Dialog, messageOf, PRIMARY_BUTTON, QUIET_BUTTON } from "./Dialog";
import type { Account, ServerProject } from "@/lib/server";

/**
 * The desktop app's account dialog: sign in and out, sync the open
 * folder with the account, and open a project from the account.
 */
export function AccountDialog({
  account,
  signedIn,
  linked,
  note,
  onSignIn,
  onCancelSignIn,
  onSignOut,
  onLink,
  onUnlink,
  listProjects,
  onOpenProject,
  onManage,
  onClose,
}: {
  /** The signed-in account; null while its name can't be fetched. */
  account: Account | null;
  signedIn: boolean;
  /** Whether the open folder syncs with the account. */
  linked: boolean;
  /** Why the dialog opened by itself, such as on Publish. */
  note?: string;
  onSignIn: (create: boolean) => Promise<void>;
  onCancelSignIn: () => void;
  onSignOut: () => Promise<void>;
  onLink: () => Promise<void>;
  onUnlink: () => Promise<void>;
  listProjects: () => Promise<ServerProject[]>;
  onOpenProject: (project: ServerProject) => Promise<void>;
  onManage: () => void;
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

  return (
    <Dialog title="Polemic account" onClose={onClose}>
      {note && <p className="mt-1.5 text-[13px]">{note}</p>}

      {!signedIn ? (
        <>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {busy === "sign-in"
              ? "Finish signing in in your browser, then come back here."
              : "Sign in to sync this project with your account, open it on another computer or in a browser, and publish it as a site. Cursive uses your Polemic account."}
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
      ) : projects ? (
        <>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            Choose a project, then an empty folder to keep it in.
          </p>
          {projects.length === 0 ? (
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
            <button type="button" className={BUTTON} onClick={() => setProjects(null)}>
              Back
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            {account
              ? `Signed in as ${account.name} (${account.email}).`
              : "Signed in."}{" "}
            {linked
              ? "This folder syncs with your account."
              : "This folder is only on this computer."}
          </p>
          <div className="mt-3 flex flex-col items-start gap-2">
            {linked ? (
              <button
                type="button"
                className={BUTTON}
                disabled={busy !== null}
                onClick={() => void run("work", onUnlink)}
              >
                Stop syncing this folder
              </button>
            ) : (
              <button
                type="button"
                className={PRIMARY_BUTTON}
                disabled={busy !== null}
                onClick={() => void run("work", onLink)}
              >
                Sync this folder to your account
              </button>
            )}
            <button
              type="button"
              className={BUTTON}
              disabled={busy !== null}
              onClick={() =>
                void run("work", async () => setProjects(await listProjects()))
              }
            >
              Open from your account…
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className={QUIET_BUTTON}
              disabled={busy !== null}
              onClick={() => void run("work", onSignOut)}
            >
              Sign out
            </button>
            <button type="button" className={QUIET_BUTTON} onClick={onManage}>
              Manage account
            </button>
            <span className="flex-1" />
            <button type="button" className={BUTTON} onClick={onClose}>
              Close
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
