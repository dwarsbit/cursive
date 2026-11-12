import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import App, { type Status } from "@/App";
import { AccountDialog } from "@/components/AccountDialog";
import { HEADER_BUTTON, PRIMARY_BUTTON } from "@/components/Dialog";
import { PublishDialog } from "@/components/PublishDialog";
import { desktopStore } from "@/lib/desktop-store";
import {
  folderSync,
  type FolderSync,
  type Link,
  type SyncState,
} from "@/lib/link-sync";
import { loadFolder, saveFolder } from "@/lib/prefs";
import type { Project, ProjectStore } from "@/lib/project";
import {
  desktopSaveFile,
  desktopTransport,
  Server,
  ServerError,
  type Account,
  type ServerProject,
} from "@/lib/server";
import { Mark } from "./Mark";

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
 * The desktop app: a project is a folder on disk. Shows the folder
 * that was open last, or asks for one. Signed in to a Polemic account,
 * a folder can sync with the account and be published.
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
    { kind: "account"; note?: string } | "publish" | null
  >(null);

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

  const choose = async () => {
    const picked = await open({ directory: true, title: "Open a folder as a project" });
    if (typeof picked !== "string") return;
    saveFolder(picked);
    setFolder(picked);
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
    const picked = await open({
      directory: true,
      title: `Choose an empty folder for “${project.name}”`,
    });
    if (typeof picked !== "string") return;
    const there = await invoke<Project>("project_load", { dir: picked }).catch(fail);
    if (Object.keys(there.pages).length > 0) {
      throw new Error("That folder already has pages. Choose an empty folder.");
    }
    await invoke("link_save", { dir: picked, projectId: project.id, state: "" }).catch(
      fail,
    );
    saveFolder(picked);
    setFolder(picked);
    setLinked((n) => n + 1);
    setDialog(null);
  };

  const publish = () => {
    if (!signedIn) {
      setDialog({
        kind: "account",
        note: "Sign in to publish this project as a site.",
      });
    } else if (!session?.sync || !session.projectId) {
      setDialog({
        kind: "account",
        note: "To publish this project, sync its folder to your account first.",
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
      account={account}
      signedIn={signedIn === true}
      linked={Boolean(session?.projectId)}
      note={dialog.note}
      onSignIn={signIn}
      onCancelSignIn={() => void invoke("account_cancel_sign_in")}
      onSignOut={signOut}
      onLink={link}
      onUnlink={unlink}
      listProjects={() => server.projects()}
      onOpenProject={openFromAccount}
      onManage={() =>
        void invoke<string>("account_server").then((url) => openUrl(`${url}/account`))
      }
      onClose={() => setDialog(null)}
    />
  );

  if (!folder) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="max-w-sm text-center">
          <Mark className="mx-auto size-12" />
          <h1 className="mt-4 text-lg font-semibold">Open a folder to start</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            A project is a folder of Markdown files. Choose one you already have, or an
            empty folder for a new project.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => void choose()}
              className={PRIMARY_BUTTON}
            >
              Open folder…
            </button>
            <button
              type="button"
              onClick={() => setDialog({ kind: "account" })}
              className="h-8 rounded-md border bg-background px-3 text-[13px] font-medium hover:bg-muted"
            >
              {signedIn ? "Open from your account…" : "Sign in…"}
            </button>
          </div>
        </div>
        {accountDialog}
      </div>
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
        onSwitchProject={() => void choose()}
        status={status}
        actions={
          <>
            <button
              type="button"
              className={HEADER_BUTTON}
              onClick={() => setDialog({ kind: "account" })}
            >
              {signedIn ? "Account" : "Sign in"}
            </button>
            <button type="button" className={HEADER_BUTTON} onClick={publish}>
              Publish
            </button>
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
