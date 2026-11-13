import { keepSnapshot, type PageSnapshot } from "./page-history";
import { removeFrom, renameIn, type Project, type ProjectStore } from "./project";

const KEY = "cursive.project.v1";
const FILES_KEY = "cursive.files.v1";
const HISTORY_KEY = "cursive.history.v1";

/** A file as an address that holds its bytes. */
const dataUrl = (data: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(data);
  });

/**
 * A project kept in this browser's storage, for the web build until
 * projects sync with an account. It starts as a copy of `seed`.
 */
export function browserStore(seed: Project): ProjectStore {
  let project: Project | null = null;
  let files: Record<string, string> | null = null;

  /** The project's files, as addresses that hold their bytes. */
  const readFiles = (): Record<string, string> => {
    if (files) return files;
    try {
      const raw = localStorage.getItem(FILES_KEY);
      const value: unknown = raw ? JSON.parse(raw) : null;
      files = value && typeof value === "object" ? (value as Record<string, string>) : {};
    } catch {
      files = {};
    }
    return files;
  };
  const writeFiles = (next: Record<string, string>) => {
    try {
      localStorage.setItem(FILES_KEY, JSON.stringify(next));
    } catch {
      throw new Error("This browser's storage is full. Try a smaller file.");
    }
    files = next;
  };
  const moveFiles = (move: (path: string) => string | null) => {
    const current = readFiles();
    const next: Record<string, string> = {};
    for (const [path, url] of Object.entries(current)) {
      const to = move(path);
      if (to) next[to] = url;
    }
    writeFiles(next);
  };

  // Snapshots of the pages, and when each page was last written in this window.
  let snapshots: Record<string, PageSnapshot[]> | null = null;
  const written = new Map<string, number>();
  const readHistory = (): Record<string, PageSnapshot[]> => {
    if (snapshots) return snapshots;
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const value: unknown = raw ? JSON.parse(raw) : null;
      snapshots = value && typeof value === "object" ? (value as Record<string, PageSnapshot[]>) : {};
    } catch {
      snapshots = {};
    }
    return snapshots;
  };
  /** Snapshots are kept as far as storage allows; when it is full, the oldest go. */
  const writeHistory = (next: Record<string, PageSnapshot[]>) => {
    snapshots = next;
    for (const keep of [Infinity, 10, 3, 0]) {
      const trimmed = Object.fromEntries(
        Object.entries(next).map(([path, list]) => [path, list.slice(0, keep)]),
      );
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
        snapshots = trimmed;
        return;
      } catch {
        // Full: try again with fewer.
      }
    }
  };
  const keepPage = (path: string, current: string | undefined, next: string, force = false) => {
    const list = readHistory()[path] ?? [];
    const now = Date.now();
    const kept = keepSnapshot(list, current, next, now, { since: written.get(path) ?? now, force });
    if (kept !== list) writeHistory({ ...readHistory(), [path]: kept });
  };
  const moveHistory = (move: (path: string) => string | null) => {
    const next: Record<string, PageSnapshot[]> = {};
    for (const [path, list] of Object.entries(readHistory())) {
      const to = move(path);
      if (to) next[to] = list;
    }
    writeHistory(next);
  };

  const read = (): Project => {
    if (project) return project;
    try {
      const raw = localStorage.getItem(KEY);
      const value = raw ? (JSON.parse(raw) as Partial<Project>) : null;
      if (
        value &&
        typeof value.name === "string" &&
        Array.isArray(value.folders) &&
        value.pages &&
        typeof value.pages === "object"
      ) {
        project = { name: value.name, folders: value.folders, pages: value.pages };
        return project;
      }
    } catch {
      // Storage is off or holds something else: start from the seed.
    }
    project = structuredClone(seed);
    return project;
  };

  const write = (next: Project) => {
    project = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      throw new Error("This browser's storage is full or turned off.");
    }
  };

  return {
    place: "browser",
    load: async () => ({ ...read(), files: Object.keys(readFiles()).sort() }),
    writePage: async (path, source) => {
      const current = read();
      keepPage(path, current.pages[path], source);
      write({ ...current, pages: { ...current.pages, [path]: source } });
      written.set(path, Date.now());
    },
    history: {
      list: async (path) => readHistory()[path] ?? [],
      keep: async (path, source) => keepPage(path, read().pages[path], source, true),
    },
    createFolder: async (path) => {
      const current = read();
      if (!current.folders.includes(path)) {
        write({ ...current, folders: [...current.folders, path] });
      }
    },
    rename: async (from, to) => {
      write(renameIn(read(), from, to));
      const move = (path: string) =>
        path === from || path.startsWith(`${from}/`) ? to + path.slice(from.length) : path;
      moveFiles(move);
      moveHistory(move);
    },
    remove: async (path) => {
      write(removeFrom(read(), path));
      const drop = (file: string) => (file === path || file.startsWith(`${path}/`) ? null : file);
      moveFiles(drop);
      moveHistory(drop);
    },
    writeFile: async (path, data) => {
      writeFiles({ ...readFiles(), [path]: await dataUrl(data) });
    },
    fileUrl: async (path) => readFiles()[path] ?? null,
    openFile: async (path) => {
      const url = readFiles()[path];
      if (!url) return;
      const link = document.createElement("a");
      link.href = url;
      link.download = path.slice(path.lastIndexOf("/") + 1);
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
  };
}
