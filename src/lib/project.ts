import { readPage, writePage } from "@cursive/editor/lib/page-file";
import { formatProperties, parseProperties } from "@cursive/editor/lib/properties";
import { mergeText, type PageChange } from "./project-doc";
import {
  ATTACHMENTS,
  parentOf,
  baseName,
  join,
  pageLabel,
  ORDER_KEY,
  pageOrder,
  type Project,
} from "@cursive/editor/lib/paths";

export * from "@cursive/editor/lib/paths";

/**
 * Where a project is kept: a folder on disk in the desktop app, the
 * account in the browser, or the browser's own storage for the demo.
 */import type { PageHistory } from "./page-history";

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
  /** Adds a file that isn't a page, such as an image, or replaces it. */
  writeFile?(path: string, data: Blob): Promise<void>;
  /** An address the window can show a file at; null when the file can't be read. */
  fileUrl?(path: string): Promise<string | null>;
  /** Opens a file in the app your computer opens it with, or saves it. */
  openFile?(path: string): Promise<void>;
  /** Tells of files that changed outside this window. Gives every file the project has. */
  onFiles?(listener: (files: string[]) => void): () => void;
  /** Earlier versions of the pages. */
  history?: PageHistory;
}

export interface TreeNode {
  kind: "folder" | "page";
  path: string;
  /** The page's title, or the folder's name. */
  label: string;
  /** Where the page stands among its folder's pages, from its `order` property. */
  order?: number;
  children: TreeNode[];
}

/**
 * The project as a tree: folders first, by name, then pages. Pages
 * with an `order` come first, in that order; the others follow by name.
 */
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
  const hasPages = (dir: string) =>
    Object.keys(project.pages).some((path) => path.startsWith(`${dir}/`));
  [...project.folders]
    .filter(
      // The attachments folder holds files the pages show, not pages of the tree.
      (path) =>
        !(
          (path === ATTACHMENTS || path.startsWith(`${ATTACHMENTS}/`)) &&
          !hasPages(path)
        ),
    )
    .sort()
    .forEach(folder);
  for (const [path, source] of Object.entries(project.pages)) {
    folder(parentOf(path)).push({
      kind: "page",
      path,
      label: pageLabel(path, source),
      order: pageOrder(source),
      children: [],
    });
  }
  const rank = (node: TreeNode) => node.order ?? Number.POSITIVE_INFINITY;
  const sort = (nodes: TreeNode[]) => {
    nodes.sort(
      (a, b) =>
        (a.kind === "folder" ? 0 : 1) - (b.kind === "folder" ? 0 : 1) ||
        (a.kind === "page" && rank(a) !== rank(b) ? rank(a) - rank(b) : 0) ||
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

/**
 * The files that give `paths`, the pages of one folder, their places
 * in that order: `order: 1`, `order: 2` and on. Pages already in their
 * place are left out.
 */
export function orderPages(
  project: Project,
  paths: string[],
): Array<[path: string, source: string]> {
  const writes: Array<[string, string]> = [];
  paths.forEach((path, index) => {
    const source = project.pages[path];
    if (source === undefined || pageOrder(source) === index + 1) return;
    const page = readPage(source);
    const properties = parseProperties(page.properties);
    const value = String(index + 1);
    const at = properties.findIndex(
      (property) => property.kind !== "raw" && property.key === ORDER_KEY,
    );
    const line = { kind: "number", key: ORDER_KEY, value } as const;
    if (at === -1) properties.push(line);
    else properties[at] = line;
    writes.push([
      path,
      writePage({ ...page, properties: formatProperties(properties) }),
    ]);
  });
  return writes;
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
    project.folders.some((f) => f.toLowerCase() === lower) ||
    (project.files ?? []).some((f) => f.toLowerCase() === lower)
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

/**
 * A free path in the attachments folder for a file named `name`:
 * "chart.png", then "chart 2.png".
 */
export function freeFilePath(project: Project, name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = fileNameFor(dot > 0 ? name.slice(0, dot) : name);
  const extension = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, "") : "";
  for (let n = 1; ; n++) {
    const path = join(ATTACHMENTS, `${n === 1 ? stem : `${stem} ${n}`}${extension}`);
    if (!taken(project, path)) return path;
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
    ...(project.files ? { files: project.files.map(move) } : {}),
  };
}

/** The project without a page or folder; a folder takes its contents along. */
export function removeFrom(project: Project, path: string): Project {
  const gone = (p: string) => p === path || p.startsWith(`${path}/`);
  return {
    ...project,
    folders: project.folders.filter((f) => !gone(f)),
    pages: Object.fromEntries(Object.entries(project.pages).filter(([p]) => !gone(p))),
    ...(project.files ? { files: project.files.filter((f) => !gone(f)) } : {}),
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
