import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { writePage } from "@/lib/page-file";
import { dragWindow, formatOpened } from "@/lib/platform";
import { NEW_PRESENTATION } from "@/slides/deck";
import { type Template, templatePages } from "@/templates";
import { newSource } from "@/tutorial/blocks";
import { ConfirmDialog } from "./ConfirmDialog";
import { BUTTON, Dialog, messageOf, PRIMARY_BUTTON } from "./Dialog";
import { Mark } from "./Mark";
import { TemplateDialog } from "./TemplateDialog";

interface Recent {
  name: string;
  path: string;
  openedAt: number;
}

/** What a new project starts with: its first page. */
const STARTS = [
  {
    id: "notes",
    label: "Notes",
    hint: "An empty page to write on",
    page: () => ({ path: "Untitled.md", file: "" }),
  },
  {
    id: "presentation",
    label: "Presentation",
    hint: "A presentation with a title slide",
    page: () => ({ path: "Untitled.md", file: NEW_PRESENTATION }),
  },
  {
    id: "tutorial",
    label: "Tutorial",
    hint: "A lesson with a quiz",
    page: () => ({
      path: "Lesson 1.md",
      file: writePage({
        title: "Lesson 1",
        properties: "",
        markdown: `\`\`\`quiz\n${newSource("quiz")}\n\`\`\`\n`,
      }),
    }),
  },
] as const;

const fail = (error: unknown): never => {
  throw new Error(typeof error === "string" ? error : messageOf(error));
};

/**
 * The desktop app without an open project: make a project in the
 * Cursive folder, or open one you had open before, a folder, or a
 * project from your account.
 */
export function ProjectPicker({
  onOpen,
  onOpenFromAccount,
}: {
  /** Opens a project's folder. Rejects with why not. */
  onOpen: (dir: string) => Promise<void>;
  onOpenFromAccount: () => void;
}) {
  const [recent, setRecent] = useState<Recent[] | null>(null);
  const [root, setRoot] = useState("");
  const [name, setName] = useState("");
  const [start, setStart] = useState<(typeof STARTS)[number]["id"]>("notes");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Recent | null>(null);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<Recent | null>(null);
  const [templates, setTemplates] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  const refresh = () =>
    invoke<{ root: string; recent: Recent[] }>("projects_list").then(
      (projects) => {
        setRoot(projects.root);
        setRecent(projects.recent);
      },
      (error: unknown) => {
        setRecent([]);
        setProblem(messageOf(error));
      },
    );

  useEffect(() => {
    document.title = "Cursive";
    void refresh();
  }, []);

  /** Runs something and says why when it didn't work. */
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

  const create = () =>
    run(async () => {
      const dir = await invoke<string>("projects_create", {
        name,
        unique: false,
      }).catch(fail);
      const { path, file } = STARTS.find((item) => item.id === start)!.page();
      await invoke("project_write_page", { dir, path, source: file }).catch(fail);
      await onOpen(dir);
    });

  /** A project with the template's pages, named as typed or after the template. */
  const createFrom = (template: Template) =>
    run(async () => {
      const typed = name.trim();
      const dir = await invoke<string>("projects_create", {
        name: typed || template.name,
        unique: typed === "",
      }).catch(fail);
      for (const [path, source] of Object.entries(templatePages(template.id))) {
        await invoke("project_write_page", { dir, path, source }).catch(fail);
      }
      await onOpen(dir);
    });

  const openFolder = () =>
    run(async () => {
      const picked = await open({
        directory: true,
        title: "Open a folder as a project",
      });
      if (typeof picked === "string") await onOpen(picked);
    });

  const rename = () =>
    run(async () => {
      if (!renaming) return;
      await invoke("projects_rename", { dir: renaming.path, name: newName }).catch(
        fail,
      );
      setRenaming(null);
      await refresh();
    });

  const trash = (project: Recent) =>
    run(async () => {
      await invoke("projects_trash", { dir: project.path }).catch(fail);
      await refresh();
    });

  return (
    <div className="relative flex h-full flex-col items-center overflow-y-auto px-4 pt-10 pb-16">
      <div className="absolute inset-x-0 top-0 h-11" onPointerDown={dragWindow} />
      <h1 className="mt-auto mb-6 flex flex-none flex-col items-center gap-3 text-lg font-semibold">
        <Mark className="size-14" />
        Cursive
      </h1>
      <div className="mb-auto w-full max-w-lg flex-none rounded-xl bg-card p-6 shadow-[var(--pop-shadow)]">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            // An empty name has nothing to create: point at the field.
            if (name.trim() === "") nameInput.current?.focus();
            else void create();
          }}
        >
          <input
            ref={nameInput}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New project name"
            aria-label="New project name"
            maxLength={120}
            className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
          />
          <button
            type="submit"
            disabled={busy}
            className={cn(PRIMARY_BUTTON, "h-9 px-4")}
          >
            Create
          </button>
        </form>
        <div
          role="radiogroup"
          aria-label="Start with"
          className="mt-3 flex gap-0.5 rounded-md bg-muted p-0.5"
        >
          {STARTS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={start === item.id}
              title={item.hint}
              onClick={() => setStart(item.id)}
              className={cn(
                "h-7 flex-1 rounded-[5px] px-2 text-[13px] font-medium whitespace-nowrap",
                start === item.id
                  ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0_0_0/8%),0_0_0_1px_var(--border)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={cn(BUTTON, "mt-2 w-full")}
          disabled={busy}
          onClick={() => {
            setProblem(null);
            setTemplates(true);
          }}
        >
          Start from a template…
        </button>
        {root && (
          <p className="mt-2 truncate text-xs text-muted-foreground" title={root}>
            New projects are folders in {root}.
          </p>
        )}
        {problem && !renaming && !templates && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {problem}
          </p>
        )}

        <h2 className="mt-5 mb-1.5 text-2xs font-semibold tracking-wider text-muted-foreground uppercase">
          Recent
        </h2>
        {recent === null ? (
          <p className="px-1.5 py-1.5 text-sm text-muted-foreground" role="status">
            Loading…
          </p>
        ) : recent.length === 0 ? (
          <p className="px-1.5 py-1.5 text-sm text-muted-foreground">
            No projects yet. Create one above or open a folder.
          </p>
        ) : (
          <ul className="-mx-1 space-y-0.5">
            {recent.map((project) => (
              <li
                key={project.path}
                className="group relative flex items-center rounded-md hover:bg-muted"
              >
                <button
                  type="button"
                  title={project.path}
                  disabled={busy}
                  onClick={() => void run(() => onOpen(project.path))}
                  className="flex min-w-0 flex-1 items-baseline gap-3 px-2.5 py-1.5 text-left"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {project.name}
                  </span>
                  <span className="flex-none text-2xs text-muted-foreground group-focus-within:invisible group-hover:invisible">
                    {formatOpened(project.openedAt)}
                  </span>
                </button>
                {/* Over the date on hover, so the row keeps its height. */}
                <div className="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label={`Rename ${project.name}`}
                    title="Rename project"
                    onClick={() => {
                      setProblem(null);
                      setNewName(project.name);
                      setRenaming(project);
                    }}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${project.name} to the trash`}
                    title="Move project to the trash"
                    onClick={() => setDeleting(project)}
                    className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={() => void openFolder()}
          >
            Open folder…
          </button>
          <button
            type="button"
            className={BUTTON}
            title="Open a project from your Polemic account, made in your browser or on another computer"
            onClick={onOpenFromAccount}
          >
            Open from your account…
          </button>
        </div>
      </div>

      {renaming && (
        <Dialog title="Rename project" onClose={() => setRenaming(null)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (newName.trim() !== "") void rename();
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onFocus={(event) => event.target.select()}
              aria-label="Project name"
              maxLength={120}
              className="mt-3 h-8 w-full rounded-md border bg-background px-2 text-[13px] outline-none focus:border-ring"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              The project's folder gets the same name.
            </p>
            {problem && (
              <p className="mt-2 text-xs text-destructive" role="alert">
                {problem}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={BUTTON}
                onClick={() => setRenaming(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={PRIMARY_BUTTON}
                disabled={busy || newName.trim() === ""}
              >
                Rename
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {templates && (
        <TemplateDialog
          busy={busy}
          problem={problem}
          onPick={(template) => void createFrom(template)}
          onClose={() => setTemplates(false)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Move “${deleting.name}” to the trash?`}
          body="The project's folder, with every page in it, moves to the trash on your computer. You can restore it from there until you empty the trash."
          confirmLabel="Move to trash"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            void trash(deleting);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
