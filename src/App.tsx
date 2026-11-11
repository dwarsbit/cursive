import { PanelLeft } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Editor, type EditorChange } from "@/components/Editor";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { PageProperties } from "@/components/PageProperties";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/cn";
import { plainText, readPage, writePage, type Page } from "@/lib/page-file";
import {
  countWords,
  loadClosedFolders,
  loadMode,
  loadOpenPage,
  saveClosedFolders,
  saveMode,
  saveOpenPage,
  type Mode,
} from "@/lib/prefs";
import {
  ancestorsOf,
  baseName,
  buildTree,
  countPages,
  fileNameFor,
  freePath,
  parentOf,
  removeFrom,
  renameIn,
  type Project,
  type ProjectStore,
  type TreeNode,
} from "@/lib/project";

const MODES: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "visual", label: "Visual", hint: "The page as blocks" },
  { id: "markdown", label: "Markdown", hint: "The page as its Markdown file" },
];

/** The first page of a tree, top to bottom. */
function firstPage(nodes: TreeNode[]): string | null {
  for (const node of nodes) {
    const path = node.kind === "page" ? node.path : firstPage(node.children);
    if (path) return path;
  }
  return null;
}

export default function App({
  store,
  firstOpen,
}: {
  store: ProjectStore;
  firstOpen?: string;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [active, setActive] = useState<string | null>(null);
  // Counts the times a page or a mode was opened: each one starts a fresh editor.
  const [opened, setOpened] = useState(0);
  const [mode, setMode] = useState(loadMode);
  const [closed, setClosed] = useState(() => new Set(loadClosedFolders()));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TreeNode | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const focusEditor = useRef<(() => void) | null>(null);
  const titleInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let current = true;
    store.load().then(
      (loaded) => {
        if (!current) return;
        const tree = buildTree(loaded);
        const wanted = [loadOpenPage(), firstOpen].find(
          (path) => path && path in loaded.pages,
        );
        setProject(loaded);
        setActive(wanted ?? firstPage(tree));
      },
      (error: unknown) => current && setProblem(String(error)),
    );
    return () => {
      current = false;
    };
  }, [store, firstOpen]);

  /** Runs a change in the store and says so when it fails. */
  const persist = (work: Promise<void>) =>
    work.then(
      () => setProblem(null),
      (error: unknown) =>
        setProblem(error instanceof Error ? error.message : String(error)),
    );

  const tree = useMemo(() => (project ? buildTree(project) : []), [project]);
  const source = project && active ? (project.pages[active] ?? null) : null;
  const page = useMemo(() => (source === null ? null : readPage(source)), [source]);
  const words = useMemo(
    () => (page ? countWords(plainText(page.markdown)) : 0),
    [page],
  );

  const update = (next: Page) => {
    if (!project || !active) return;
    const file = writePage(next);
    if (file === project.pages[active]) return;
    setProject({ ...project, pages: { ...project.pages, [active]: file } });
    void persist(store.writePage(active, file));
  };

  /**
   * Names the open page's file after its title, once the title is
   * typed. Returns the project as it is after that.
   */
  const syncFileName = (): Project | null => {
    if (!project || !active || !page?.title.trim()) return project;
    const wanted = freePath(
      project,
      parentOf(active),
      fileNameFor(page.title),
      ".md",
      active,
    );
    if (wanted === active) return project;
    const renamed = renameIn(project, active, wanted);
    setProject(renamed);
    setActive(wanted);
    saveOpenPage(wanted);
    void persist(store.rename(active, wanted));
    return renamed;
  };

  const open = (path: string) => {
    if (path !== active) {
      syncFileName();
      setActive(path);
      setOpened((n) => n + 1);
      saveOpenPage(path);
    }
    setNavOpen(false);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    syncFileName();
    setMode(next);
    setOpened((n) => n + 1);
    saveMode(next);
  };

  // Cmd/Ctrl + / switches between the two modes. It is caught on the
  // way down, before an editor reads the keys as its own shortcut.
  const toggleMode = useRef(() => {});
  useEffect(() => {
    toggleMode.current = () => switchMode(mode === "visual" ? "markdown" : "visual");
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        toggleMode.current();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const setFolderOpen = (path: string, isOpen: boolean) => {
    const next = new Set(closed);
    if (isOpen) next.delete(path);
    else next.add(path);
    setClosed(next);
    saveClosedFolders([...next]);
  };

  const newPage = (folder: string) => {
    const current = syncFileName();
    if (!current) return;
    const path = freePath(current, folder, "Untitled", ".md");
    setProject({ ...current, pages: { ...current.pages, [path]: "" } });
    setActive(path);
    setOpened((n) => n + 1);
    setMode("visual");
    saveOpenPage(path);
    if (folder) setFolderOpen(folder, true);
    setNavOpen(false);
    void persist(store.writePage(path, ""));
    requestAnimationFrame(() => titleInput.current?.focus());
  };

  const newFolder = () => {
    if (!project) return;
    const path = freePath(project, "", "New folder", "");
    setProject({ ...project, folders: [...project.folders, path] });
    setRenaming(path);
    void persist(store.createFolder(path));
  };

  const renameFolder = (path: string, name: string) => {
    if (!project) return;
    const wanted = freePath(project, parentOf(path), fileNameFor(name), "", path);
    if (wanted === path) return;
    setProject(renameIn(project, path, wanted));
    if (active?.startsWith(`${path}/`)) {
      const moved = wanted + active.slice(path.length);
      setActive(moved);
      saveOpenPage(moved);
    }
    void persist(store.rename(path, wanted));
  };

  const remove = (node: TreeNode) => {
    if (!project) return;
    const next = removeFrom(project, node.path);
    setProject(next);
    if (active && !(active in next.pages)) {
      setActive(firstPage(buildTree(next)));
      setOpened((n) => n + 1);
    }
    void persist(store.remove(node.path));
  };

  const title = page?.title.trim() ?? "";
  useEffect(() => {
    document.title = title ? `${title} · Cursive` : "Cursive";
  }, [title]);

  if (!project) {
    return (
      <p
        className="grid h-full place-items-center text-sm text-muted-foreground"
        role="status"
      >
        {problem ?? "Opening your project…"}
      </p>
    );
  }

  return (
    <div className={cn("app", navOpen && "nav-open")}>
      <Sidebar
        projectName={project.name}
        tree={tree}
        active={active}
        closed={closed}
        renaming={renaming}
        onOpen={open}
        onToggle={(path) => setFolderOpen(path, closed.has(path))}
        onNewPage={newPage}
        onNewFolder={newFolder}
        onRename={setRenaming}
        onRenameFolder={renameFolder}
        onDelete={setDeleting}
      />
      <div className="scrim" onClick={() => setNavOpen(false)} />

      <main className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] bg-card shadow-[0_1px_2px_oklch(14.5%_0.008_326/5%),0_0_0_1px_var(--border)]">
        <header className="flex h-11 flex-none items-center gap-2 px-3 text-xs">
          <button
            type="button"
            className="menu-button"
            aria-label="Show pages"
            onClick={() => setNavOpen(true)}
          >
            <PanelLeft className="size-4" aria-hidden />
          </button>
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 flex-1 items-center gap-1.5"
          >
            {active &&
              ancestorsOf(active).map((folder) => (
                <span key={folder} className="crumb-folder contents">
                  <span className="truncate text-muted-foreground">
                    {baseName(folder)}
                  </span>
                  <span className="text-muted-foreground/60">/</span>
                </span>
              ))}
            <span className="truncate">{page ? title || "Untitled" : ""}</span>
          </nav>
          {page && (
            <div
              role="group"
              aria-label="Editor mode"
              className="inline-flex flex-none gap-0.5 rounded-[7px] bg-muted p-0.5"
            >
              {MODES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={mode === item.id}
                  title={`${item.hint} (Cmd/Ctrl + /)`}
                  onClick={() => switchMode(item.id)}
                  className={cn(
                    "h-6 rounded-[5px] px-2.5 text-xs font-medium",
                    mode === item.id
                      ? "bg-card text-foreground shadow-[0_1px_2px_oklch(0_0_0/8%),0_0_0_1px_var(--border)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto" id="page-scroll">
          {!page ? (
            <div className="grid h-full place-items-center">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  This project has no pages yet.
                </p>
                <button
                  type="button"
                  onClick={() => newPage("")}
                  className="mt-3 h-8 rounded-md border border-primary-edge bg-primary-fill px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary-fill/85"
                >
                  New page
                </button>
              </div>
            </div>
          ) : mode === "visual" ? (
            <article className="page" key={opened}>
              <input
                ref={titleInput}
                className="page-title"
                value={page.title}
                placeholder="Untitled"
                aria-label="Page title"
                onChange={(event) => update({ ...page, title: event.target.value })}
                onBlur={() => void syncFileName()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "ArrowDown") {
                    event.preventDefault();
                    focusEditor.current?.();
                  }
                }}
              />
              <PageProperties
                raw={page.properties}
                onChange={(properties) => update({ ...page, properties })}
              />
              <Editor
                markdown={page.markdown}
                onChange={(change: EditorChange) =>
                  update({ ...page, markdown: change.markdown })
                }
                focusRef={focusEditor}
              />
            </article>
          ) : (
            <MarkdownEditor
              key={opened}
              source={source ?? ""}
              onChange={(file) => update(readPage(file))}
            />
          )}
        </div>

        <footer className="flex h-7 flex-none items-center gap-3.5 border-t px-3.5 text-2xs whitespace-nowrap text-muted-foreground tabular-nums">
          <span className="inline-flex min-w-0 items-center gap-1.5" role="status">
            <span
              aria-hidden
              className={`size-1.5 flex-none rounded-full ${problem ? "bg-warning" : "bg-success"}`}
            />
            <span className="truncate">
              {problem ? `Not saved. ${problem}` : "Saved in this browser"}
            </span>
          </span>
          {active && <span className="path truncate font-mono">{active}</span>}
          <span className="flex-1" />
          {page && (
            <span>
              {words === 1 ? "1 word" : `${words.toLocaleString("en-US")} words`}
            </span>
          )}
        </footer>
      </main>

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.label}”?`}
          body={
            deleting.kind === "page"
              ? "The page is removed from this project. You can't undo this."
              : countPages(deleting) === 0
                ? "The folder is removed from this project. You can't undo this."
                : `The folder and the ${countPages(deleting) === 1 ? "page" : `${countPages(deleting)} pages`} in it are removed from this project. You can't undo this.`
          }
          confirmLabel="Delete"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            remove(deleting);
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
