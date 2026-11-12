import { readPage } from "./page-file";
import { mergeText, type PageChange } from "./project-doc";

/**
 * A project: a folder of Markdown files. Paths use `/` and are
 * relative to the project folder; a page's path ends in `.md`.
 */
export interface Project {
  name: string;
  /** Every folder, also the empty ones. */
  folders: string[];
  /** Each page's file, by path. */
  pages: Record<string, string>;
}

/**
 * Where a project is kept: a folder on disk in the desktop app, the
 * account in the browser, or the browser's own storage for the demo.
 */
export interface ProjectStore {
  /** Where the project is kept, for the status bar and the delete question. */
  place: "browser" | "disk" | "account";
  /**
   * Tells of pages that changed outside this window: on another
   * computer or in another browser tab.
   */
  subscribe?(listener: (changes: PageChange[]) => void): () => void;
  load(): Promise<Project>;
  writePage(path: string, source: string): Promise<void>;
  createFolder(path: string): Promise<void>;
  /** Moves a page, or a folder with everything in it. */
  rename(from: string, to: string): Promise<void>;
  /** Deletes a page, or a folder with everything in it. */
  remove(path: string): Promise<void>;
}

export interface TreeNode {
  kind: "folder" | "page";
  path: string;
  /** The page's title, or the folder's name. */
  label: string;
  children: TreeNode[];
}

export const isPagePath = (path: string) => path.toLowerCase().endsWith(".md");
export const parentOf = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** A page's name in the tree: its title, or its file name without `.md`. */
export function pageLabel(path: string, source: string): string {
  return (
    readPage(source).title.trim() || baseName(path).replace(/\.md$/i, "") || "Untitled"
  );
}

/** The project as a tree: folders first, then pages, each by name. */
export function buildTree(project: Project): TreeNode[] {
  const root: TreeNode[] = [];
  const folders = new Map<string, TreeNode>();
  const folder = (path: string): TreeNode[] => {
    if (!path) return root;
    const known = folders.get(path);
    if (known) return known.children;
    const node: TreeNode = {
      kind: "folder",
      path,
      label: baseName(path),
      children: [],
    };
    folders.set(path, node);
    folder(parentOf(path)).push(node);
    return node.children;
  };
  [...project.folders].sort().forEach(folder);
  for (const [path, source] of Object.entries(project.pages)) {
    folder(parentOf(path)).push({
      kind: "page",
      path,
      label: pageLabel(path, source),
      children: [],
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort(
      (a, b) =>
        (a.kind === "folder" ? 0 : 1) - (b.kind === "folder" ? 0 : 1) ||
        a.label.localeCompare(b.label, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
    );
    nodes.forEach((node) => sort(node.children));
  };
  sort(root);
  return root;
}

/** How many pages a folder holds, at any depth. */
export function countPages(node: TreeNode): number {
  return node.kind === "page"
    ? 1
    : node.children.reduce((n, child) => n + countPages(child), 0);
}

/**
 * A file or folder name made from a title: readable, and safe on
 * macOS, Windows and Linux.
 */
export function fileNameFor(title: string): string {
  const name = title
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 80)
    .trim();
  if (!name || /^(?:con|prn|aux|nul|com\d|lpt\d)$/i.test(name)) return "Untitled";
  return name;
}

const taken = (project: Project, path: string) => {
  const lower = path.toLowerCase();
  return (
    Object.keys(project.pages).some((p) => p.toLowerCase() === lower) ||
    project.folders.some((f) => f.toLowerCase() === lower)
  );
};

/**
 * A free path in `dir` for `name`: "Notes.md", then "Notes 2.md".
 * `except` is a path that may be reused, for a rename onto itself.
 */
export function freePath(
  project: Project,
  dir: string,
  name: string,
  extension: "" | ".md",
  except?: string,
): string {
  for (let n = 1; ; n++) {
    const path = join(dir, `${n === 1 ? name : `${name} ${n}`}${extension}`);
    if (path.toLowerCase() === except?.toLowerCase() || !taken(project, path))
      return path;
  }
}

/** The project with a page or folder moved; a folder takes its contents along. */
export function renameIn(project: Project, from: string, to: string): Project {
  if (from === to) return project;
  const move = (path: string) =>
    path === from
      ? to
      : path.startsWith(`${from}/`)
        ? to + path.slice(from.length)
        : path;
  return {
    ...project,
    folders: project.folders.map(move),
    pages: Object.fromEntries(
      Object.entries(project.pages).map(([path, source]) => [move(path), source]),
    ),
  };
}

/** The project without a page or folder; a folder takes its contents along. */
export function removeFrom(project: Project, path: string): Project {
  const gone = (p: string) => p === path || p.startsWith(`${path}/`);
  return {
    ...project,
    folders: project.folders.filter((f) => !gone(f)),
    pages: Object.fromEntries(Object.entries(project.pages).filter(([p]) => !gone(p))),
  };
}

/** The folders a path sits in, outermost first. */
export function ancestorsOf(path: string): string[] {
  const parts = path.split("/").slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

/**
 * The project after pages changed elsewhere. Where a page was also
 * changed here since, both changes are kept, and `writes` lists the
 * pages the store doesn't have in that form yet.
 */
export function applyChanges(
  project: Project,
  changes: PageChange[],
): { project: Project; writes: Array<[path: string, source: string]> } {
  const pages = { ...project.pages };
  const writes: Array<[string, string]> = [];
  for (const { path, base, text } of changes) {
    const current = pages[path] ?? null;
    if (current === text) continue;
    if (text === null) {
      // Deleted elsewhere. A page changed here since stays, and is written again.
      if (current === base) delete pages[path];
      else if (current !== null) writes.push([path, current]);
    } else if (current === null || current === base) {
      pages[path] = text;
    } else {
      pages[path] = mergeText(base ?? "", current, text);
      writes.push([path, pages[path]]);
    }
  }
  return { project: { ...project, pages }, writes };
}
