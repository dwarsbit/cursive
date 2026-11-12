import { useEffect, useState } from "react";
import { BUTTON, Dialog, messageOf, PRIMARY_BUTTON, QUIET_BUTTON } from "./Dialog";
import { LearnersDialog } from "./LearnersDialog";
import type { SaveFile, Server, SiteState } from "@/lib/server";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * Publishes the project as a site, and takes it down again. The server
 * makes the site from the pages it has, so `prepare` first sends what
 * the desktop app still has to send.
 */
export function PublishDialog({
  server,
  projectId,
  prepare,
  openUrl,
  saveFile,
  onClose,
}: {
  server: Server;
  projectId: string;
  prepare?: () => Promise<void>;
  openUrl: (url: string) => void;
  saveFile: SaveFile;
  onClose: () => void;
}) {
  const [state, setState] = useState<SiteState | null>(null);
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [learners, setLearners] = useState(false);

  useEffect(() => {
    let current = true;
    server.site(projectId).then(
      (loaded) => {
        if (!current) return;
        setState(loaded);
        setSlug(loaded.site?.slug ?? loaded.suggestedSlug);
      },
      (error: unknown) => current && setProblem(messageOf(error)),
    );
    return () => {
      current = false;
    };
  }, [server, projectId]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await work();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const publish = () =>
    run(async () => {
      await prepare?.();
      const site = await server.publish(projectId, slug.trim().toLowerCase());
      setState((known) => known && { ...known, site });
      setSlug(site.slug);
    });

  const unpublish = () =>
    run(async () => {
      await server.unpublish(projectId);
      setState((known) => known && { ...known, site: null });
    });

  const site = state?.site ?? null;

  if (learners) {
    return (
      <LearnersDialog
        server={server}
        projectId={projectId}
        saveFile={saveFile}
        onClose={() => setLearners(false)}
      />
    );
  }

  return (
    <Dialog title="Publish this project" onClose={onClose}>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        Your pages become a site that anyone with the address can read. Publish again to
        bring the site up to date. Pages with a quiz or an assignment make it a
        tutorial: readers check their answers and track their progress.
      </p>

      {state && (
        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void publish();
          }}
        >
          <label htmlFor="site-slug" className="text-xs font-medium">
            Address
          </label>
          <div className="mt-1 flex h-8 items-center rounded-md border bg-background text-[13px] focus-within:border-ring">
            <span className="truncate pl-2 text-muted-foreground">{state.baseUrl}</span>
            <input
              id="site-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              spellCheck={false}
              autoCapitalize="none"
              className="h-full min-w-24 flex-1 bg-transparent pr-2 outline-none"
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            3 to 40 lowercase letters, digits and hyphens.
          </p>
        </form>
      )}

      {site && (
        <p className="mt-3 text-[13px]">
          <button
            type="button"
            className="font-medium text-primary underline underline-offset-2"
            onClick={() => openUrl(site.url)}
          >
            {site.url.replace(/^https?:\/\//, "")}
          </button>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Published {day(site.publishedAt)} ·{" "}
            {site.pages === 1 ? "1 page" : `${site.pages} pages`}
          </span>
        </p>
      )}

      {!state && !problem && (
        <p className="mt-3 text-[13px] text-muted-foreground" role="status">
          Loading…
        </p>
      )}
      {problem && (
        <p className="mt-3 text-[13px] text-destructive" role="alert">
          {problem}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        {site && (
          <button
            type="button"
            className={QUIET_BUTTON}
            disabled={busy}
            onClick={() => void unpublish()}
          >
            Unpublish
          </button>
        )}
        {site && (
          <button
            type="button"
            className={QUIET_BUTTON}
            title="Readers who signed in to your tutorial, and the work they handed in"
            onClick={() => setLearners(true)}
          >
            Learners
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className={BUTTON} onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className={PRIMARY_BUTTON}
          disabled={busy || !state || slug.trim() === ""}
          onClick={() => void publish()}
        >
          {busy ? "Working…" : site ? "Publish again" : "Publish"}
        </button>
      </div>
    </Dialog>
  );
}
