import { Send } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import App, { type Status } from "@/App";
import { BUTTON, HEADER_BUTTON, messageOf, PRIMARY_BUTTON } from "@/components/Dialog";
import { PublishDialog } from "@/components/PublishDialog";
import {
  browserSaveFile,
  browserTransport,
  Server,
  type Account,
  type ServerProject,
} from "@/lib/server";
import { serverStore } from "@/lib/server-store";
import { Mark } from "./Mark";

const server = new Server(browserTransport);

/** Where the app is served: "/cursive/". */
const BASE = import.meta.env.BASE_URL;

/** The project in the address, or null on the projects list. */
const projectIn = (path: string) =>
  path.startsWith(BASE)
    ? decodeURIComponent(path.slice(BASE.length).split("/")[0]) || null
    : null;

const subscribeToAddress = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
};

function go(path: string) {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const openUrl = (url: string) => void window.open(url, "_blank", "noopener");

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** The account's Cursive projects, and a field to start a new one. */
function Projects({ account }: { account: Account }) {
  const [projects, setProjects] = useState<ServerProject[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Projects · Cursive";
    server
      .projects()
      .then(setProjects, (error: unknown) => setProblem(messageOf(error)));
  }, []);

  const create = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const project = await server.createProject(name.trim() || "Notes", "online");
      go(`${BASE}${project.id}`);
    } catch (error) {
      setProblem(messageOf(error));
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl px-4 py-10">
        <header className="flex items-center gap-2">
          <Mark className="size-[22px] flex-none" />
          <h1 className="flex-1 text-sm font-semibold">Cursive</h1>
          <a
            href="/account"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {account.name}
          </a>
        </header>

        <h2 className="mt-8 text-lg font-semibold">Projects</h2>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name of a new project"
            aria-label="Name of a new project"
            maxLength={120}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-[13px] outline-none focus:border-ring"
          />
          <button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
            New project
          </button>
        </form>

        {problem && (
          <p className="mt-3 text-[13px] text-destructive" role="alert">
            {problem}
          </p>
        )}

        {!projects ? (
          !problem && (
            <p className="mt-6 text-[13px] text-muted-foreground" role="status">
              Loading your projects…
            </p>
          )
        ) : projects.length === 0 ? (
          <p className="mt-6 text-[13px] text-muted-foreground">
            You have no projects yet. Start one here, or sync a folder from the desktop
            app.
          </p>
        ) : (
          <ul className="mt-4 overflow-hidden rounded-[10px] bg-card shadow-[0_0_0_1px_var(--border)]">
            {projects.map((project) => (
              <li key={project.id} className="border-b last:border-b-0">
                <a
                  href={`${BASE}${project.id}`}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                    event.preventDefault();
                    go(`${BASE}${project.id}`);
                  }}
                  className="flex h-9 items-center gap-3 px-3 text-[13px] hover:bg-muted"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {project.name}
                  </span>
                  <span className="flex-none text-xs text-muted-foreground">
                    {project.owner.id === account.id ? "" : `${project.owner.name} · `}
                    {day(project.updatedAt)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// A store closes a moment after its screen goes, so a screen that
// comes straight back (as React does in development) keeps it.
const closing = new WeakMap<object, ReturnType<typeof setTimeout>>();

/** One project of the account, open in the editor. */
function OpenProject({ id }: { id: string }) {
  const store = useMemo(() => serverStore(server, id), [id]);
  const [info, setInfo] = useState<ServerProject | null>(null);
  const [saved, setSaved] = useState(true);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    clearTimeout(closing.get(store));
    store.onSaved(() => setSaved(store.saved()));
    return () =>
      void closing.set(
        store,
        setTimeout(() => store.close(), 0),
      );
  }, [store]);

  useEffect(() => {
    let current = true;
    server.project(id).then(
      (project) => current && setInfo(project),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [id]);

  // Leaving with changes still on their way asks first.
  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!store.saved()) event.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [store]);

  const status: Status | undefined =
    info && !info.writable
      ? { text: "You can read this project. Your changes aren't saved", warn: true }
      : saved
        ? undefined
        : { text: "Saving…" };

  return (
    <>
      <App
        store={store}
        onSwitchProject={() => go(BASE)}
        onRenameProject={
          info?.role === "owner"
            ? async (name) => setInfo(await server.renameProject(id, name))
            : undefined
        }
        status={status}
        actions={
          info?.role === "owner" && (
            <button
              type="button"
              className={HEADER_BUTTON}
              onClick={() => setPublishing(true)}
            >
              <Send className="size-3.5" aria-hidden />
              Publish
            </button>
          )
        }
      />
      {publishing && (
        <PublishDialog
          server={server}
          projectId={id}
          openUrl={openUrl}
          saveFile={browserSaveFile}
          onClose={() => setPublishing(false)}
        />
      )}
    </>
  );
}

/**
 * Cursive in the browser, on the Polemic server: the account's
 * projects at /cursive/, one project at /cursive/<id>. Signed out, it
 * goes to the server's sign-in page and comes back.
 */
export function Web() {
  const path = useSyncExternalStore(subscribeToAddress, () => window.location.pathname);
  const [account, setAccount] = useState<Account | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    server.me().then(
      (me) => {
        if (me) setAccount(me);
        else {
          const back = window.location.pathname + window.location.search;
          window.location.assign(`/sign-in?next=${encodeURIComponent(back)}`);
        }
      },
      (error: unknown) => setProblem(messageOf(error)),
    );
  }, []);

  if (!account) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-sm text-muted-foreground" role="status">
            {problem ?? "Opening Cursive…"}
          </p>
          {problem && (
            <button
              type="button"
              className={`${BUTTON} mt-3`}
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const id = projectIn(path);
  return id ? <OpenProject key={id} id={id} /> : <Projects account={account} />;
}
