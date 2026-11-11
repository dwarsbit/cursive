import { removeFrom, renameIn, type Project, type ProjectStore } from "./project";

const KEY = "cursive.project.v1";

/**
 * A project kept in this browser's storage, for the web build until
 * projects sync with an account. It starts as a copy of `seed`.
 */
export function browserStore(seed: Project): ProjectStore {
  let project: Project | null = null;

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
    load: async () => read(),
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
    rename: async (from, to) => write(renameIn(read(), from, to)),
    remove: async (path) => write(removeFrom(read(), path)),
  };
}
