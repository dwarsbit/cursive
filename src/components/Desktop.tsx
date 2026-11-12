import { invoke } from "@tauri-apps/api/core";
import { Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import App, { type Status } from "@/App";
import { AccountDialog, type AccountAsk } from "@/components/AccountDialog";
import { AccountMenu } from "@/components/AccountMenu";
import { HEADER_BUTTON } from "@/components/Dialog";
import { ProjectPicker } from "@/components/ProjectPicker";
import { PublishDialog } from "@/components/PublishDialog";
import { desktopStore } from "@/lib/desktop-store";
import {
  folderSync,
  type FolderSync,
  type Link,
  type SyncState,
} from "@/lib/link-sync";
import { hasWindowButtons } from "@/lib/platform";
import { forgetFolder, loadFolder, saveFolder } from "@/lib/prefs";
import type { ProjectStore } from "@/lib/project";
import {
  desktopSaveFile,
  desktopTransport,
  Server,
  ServerError,
  type Account,
  type ServerProject,
} from "@/lib/server";

const server = new Server(desktopTransport);

const fail = (error: unknown): never => {
  throw new Error(typeof error === "string" ? error : String(error));
};

/** The folder's own name: the last part of its path. */
const folderName = (dir: string) =>
  dir
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() || "Notes";

/** A name a folder can have: a project's name without the marks a file system refuses. */
const asFolderName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "") || "Notes";

const STATUS: Record<Exclude<SyncState["kind"], "error">, Status> = {
  syncing: { text: "Saved. Syncing…" },
  synced: { text: "Saved and synced" },
  offline: { text: "Saved. Not synced: the server can't be reached", warn: true },
  "signed-out": { text: "Saved. Sign in to sync", warn: true },
  gone: {
    text: "Saved. Not synced: this project is no longer in your account",
    warn: true,
  },
};

/** An open folder: its store, and its sync when it is linked and signed in. */
interface Session {
  id: number;
  dir: string;
  store: ProjectStore & { flush: () => Promise<void> };
  appStore: ProjectStore;
  projectId: string | null;
  sync: FolderSync | null;
}

let sessions = 0;

async function openSession(dir: string, signedIn: boolean): Promise<Session> {
  const store = desktopStore(dir);
  const session: Session = {
    id: ++sessions,
    dir,
    store,
    appStore: store,
    projectId: null,
    sync: null,
  };
  const link = await invoke<Link | null>("link_load", { dir }).catch(() => null);
  if (!link) return session;
  session.projectId = link.projectId;
  if (!signedIn) return session;

  // A project you can only read syncs one way. Unreachable, it is taken as yours.
  const writable = await server.project(link.projectId).then(
    (project) => project.writable,
    () => true,
  );
  const sync = folderSync({
    server,
    folder: store.folder,
    link,
    writable,
    saveLink: (next) =>
      invoke<void>("link_save", { dir, projectId: next.projectId, state: next.state }),
  });
  session.sync = sync;
  const first = sync.run();
  const touched = <T,>(work: Promise<T>) => {
    sync.touch();
    return work;
  };
  session.appStore = {
    ...store,
    // The folder is read after the first sync, or after a few seconds without one.
    load: async () => {
      await Promise.race([first, new Promise((done) => setTimeout(done, 5_000))]);
      return store.load();
    },
    subscribe: sync.onChanges,
    writePage: (path, source) => touched(store.writePage(path, source)),
    rename: (from, to) => touched(store.rename(from, to)),
    remove: (path) => touched(store.remove(path)),
  };
  return session;
}

/**
 * The desktop app: a project is a folder on disk, by default one in
 * the Cursive folder in your home folder. Shows the project that was
 * open last, or the projects to pick from. Signed in to a Polemic
 * account, a project can sync with the account and be published.
 */
export function Desktop() {
  const [folder, setFolder] = useState(loadFolder);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  // Counts the changes to the folder's link: each one opens the folder anew.
  const [linked, setLinked] = useState(0);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [dialog, setDialog] = useState<
    { ask: AccountAsk; note?: string } | "publish" | null
  >(null);

  // The macOS window buttons sit over the app's top left corner, which
  // makes room for them. A full-screen window has none.
  useEffect(() => {
    if (!hasWindowButtons) return;
    const root = document.documentElement;
    root.classList.add("window-buttons");
    let live = true;
    let stop: (() => void) | undefined;
    void import("@tauri-apps/api/window")
      .then(async ({ getCurrentWindow }) => {
        const appWindow = getCurrentWindow();
        const sync = () =>
          void appWindow.isFullscreen().then(
            (full) => live && root.classList.toggle("window-buttons", !full),
            () => {},
          );
        sync();
        const unlisten = await appWindow.onResized(sync);
        if (live) stop = unlisten;
        else unlisten();
      })
      .catch(() => {});
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  useEffect(() => {
    invoke<boolean>("account_signed_in").then(setSignedIn, () => setSignedIn(false));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    server.me().then(
      (me) => {
        if (!current) return;
        if (me) setAccount(me);
        else setSignedIn(false);
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [signedIn]);

  useEffect(() => {
    if (!folder || signedIn === null) return;
    let current = true;
    let opened: Session | null = null;
    void openSession(folder, signedIn).then((next) => {
      if (!current) {
        next.sync?.stop();
        return;
      }
      opened = next;
      setSession(next);
      setSyncState(next.sync?.state() ?? null);
      next.sync?.onState((state) => {
        if (!current) return;
        setSyncState(state);
        if (state.kind === "signed-out") setSignedIn(false);
      });
    });
    return () => {
      current = false;
      opened?.sync?.stop();
      void opened?.store.flush().catch(() => {});
    };
  }, [folder, signedIn, linked]);

  // Pages still waiting to be written are written before the window
  // closes, and a window that comes back syncs.
  useEffect(() => {
    if (!session) return;
    const onHide = () => void session.store.flush().catch(() => {});
    const onFocus = () => void session.sync?.run();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("blur", onHide);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("blur", onHide);
      window.removeEventListener("focus", onFocus);
    };
  }, [session]);

  /** Opens a folder as the project, and puts it at the top of the recent ones. */
  const openProject = useCallback(async (dir: string) => {
    const opened = await invoke<{ path: string }>("projects_opened", { dir }).catch(
      fail,
    );
    saveFolder(opened.path);
    setFolder(opened.path);
  }, []);

  // The project that was open last comes back, unless its folder is gone.
  useEffect(() => {
    const last = loadFolder();
    if (!last) return;
    invoke<{ path: string }>("projects_opened", { dir: last }).then(
      (opened) => {
        saveFolder(opened.path);
        setFolder(opened.path);
      },
      () => {
        forgetFolder();
        setFolder(null);
      },
    );
  }, []);

  const closeProject = () => {
    void session?.store.flush().catch(() => {});
    forgetFolder();
    setFolder(null);
  };

  const renameProject = async (name: string) => {
    if (!folder || !session) return;
    await session.store.flush();
    const moved = await invoke<string>("projects_rename", { dir: folder, name }).catch(
      fail,
    );
    // The project in the account gets the name too, when it is yours to rename.
    if (session.projectId && signedIn) {
      await server.renameProject(session.projectId, name).catch(() => {});
    }
    saveFolder(moved);
    setFolder(moved);
  };

  const openUrl = useCallback(
    (url: string) => void invoke("open_in_browser", { url }).catch(() => {}),
    [],
  );

  const signIn = async (create: boolean) => {
    setAccount(await invoke<Account>("account_sign_in", { create }).catch(fail));
    setSignedIn(true);
  };

  const signOut = async () => {
    await invoke("account_sign_out").catch(fail);
    setAccount(null);
    setSignedIn(false);
  };

  const link = async () => {
    if (!folder) return;
    await session?.store.flush();
    const project = await server.createProject(folderName(folder), "linked");
    await invoke("link_save", { dir: folder, projectId: project.id, state: "" }).catch(
      fail,
    );
    setLinked((n) => n + 1);
  };

  const unlink = async () => {
    if (!folder) return;
    await invoke("link_remove", { dir: folder }).catch(fail);
    setLinked((n) => n + 1);
  };

  const openFromAccount = async (project: ServerProject) => {
    const dir = await invoke<string>("projects_create", {
      name: asFolderName(project.name),
      unique: true,
    }).catch(fail);
    await invoke("link_save", { dir, projectId: project.id, state: "" }).catch(fail);
    await openProject(dir);
    setLinked((n) => n + 1);
    setDialog(null);
  };

  const publish = () => {
    if (!signedIn) {
      setDialog({
        ask: "sync",
        note: "Sign in to publish this project as a site.",
      });
    } else if (!session?.sync || !session.projectId) {
      setDialog({
        ask: "sync",
        note: "To publish this project, sync it to your account first.",
      });
    } else setDialog("publish");
  };

  const status = useMemo<Status | undefined>(() => {
    if (!session?.projectId) return undefined;
    if (!signedIn) return STATUS["signed-out"];
    if (!syncState) return undefined;
    return syncState.kind === "error"
      ? { text: `Saved. Not synced: ${syncState.message}`, warn: true }
      : STATUS[syncState.kind];
  }, [session, signedIn, syncState]);

  const accountDialog = dialog && dialog !== "publish" && (
    <AccountDialog
      ask={dialog.ask}
      signedIn={signedIn === true}
      note={dialog.note}
      onSignIn={async (create) => {
        await signIn(create);
        // Signed in, and nothing left to ask: the project syncs already.
        if (dialog.ask === "sign-in" || (dialog.ask === "sync" && session?.projectId)) {
          setDialog(null);
        }
      }}
      onCancelSignIn={() => void invoke("account_cancel_sign_in")}
      onLink={async () => {
        await link();
        setDialog(null);
      }}
      listProjects={() => server.projects()}
      onOpenProject={openFromAccount}
      onClose={() => setDialog(null)}
    />
  );

  if (!folder) {
    return (
      <>
        <ProjectPicker
          onOpen={openProject}
          onOpenFromAccount={() => setDialog({ ask: "projects" })}
        />
        {accountDialog}
      </>
    );
  }

  if (!session || session.dir !== folder) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <p className="text-sm text-muted-foreground" role="status">
          Opening your project…
        </p>
      </div>
    );
  }

  return (
    <>
      <App
        key={session.id}
        store={session.appStore}
        onSwitchProject={closeProject}
        onRenameProject={renameProject}
        status={status}
        actions={
          <>
            <button type="button" className={HEADER_BUTTON} onClick={publish}>
              <Send className="size-3.5" aria-hidden />
              Publish
            </button>
            {signedIn ? (
              <AccountMenu
                account={account}
                linked={Boolean(session.projectId)}
                onLink={link}
                onUnlink={unlink}
                onManage={() =>
                  void invoke<string>("account_server").then((url) =>
                    openUrl(`${url}/account`),
                  )
                }
                onSignOut={signOut}
              />
            ) : (
              <button
                type="button"
                className={HEADER_BUTTON}
                onClick={() => setDialog({ ask: "sign-in" })}
              >
                Sign in
              </button>
            )}
          </>
        }
      />
      {accountDialog}
      {dialog === "publish" && session.projectId && (
        <PublishDialog
          server={server}
          projectId={session.projectId}
          prepare={async () => {
            await session.sync?.run();
            const state = session.sync?.state();
            if (state && state.kind !== "synced") {
              throw new ServerError(
                0,
                "not_synced",
                "The project couldn't be synced, so the site would be out of date. Try again when you're online.",
              );
            }
          }}
          openUrl={openUrl}
          saveFile={desktopSaveFile}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
