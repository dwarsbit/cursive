import { removeFrom, renameIn, type Project, type ProjectStore } from "./project";

const KEY = "cursive.project.v1";
const FILES_KEY = "cursive.files.v1";

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
      write({ ...current, pages: { ...current.pages, [path]: source } });
    },
    createFolder: async (path) => {
      const current = read();
      if (!current.folders.includes(path)) {
        write({ ...current, folders: [...current.folders, path] });
      }
    },
    rename: async (from, to) => {
      write(renameIn(read(), from, to));
      moveFiles((path) =>
        path === from || path.startsWith(`${from}/`) ? to + path.slice(from.length) : path,
      );
    },
    remove: async (path) => {
      write(removeFrom(read(), path));
      moveFiles((file) => (file === path || file.startsWith(`${path}/`) ? null : file));
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
