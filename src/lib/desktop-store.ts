import { invoke } from "@tauri-apps/api/core";
import type { Folder } from "./link-sync";
import type { Project, ProjectStore } from "./project";

/** Is this the desktop app, not the browser build? */
export const isDesktop =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** How long typing rests before a page is written to disk. */
const WRITE_DELAY = 400;

/**
 * A project as a folder of Markdown files on disk. Pages are written a
 * moment after the last change, and always before anything that moves
 * or deletes them.
 */
export function desktopStore(
  dir: string,
): ProjectStore & { flush: () => Promise<void>; folder: Folder } {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let waiting: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];
  // Changes run one after another, in the order they were made.
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  };

  const flush = (): Promise<void> => {
    clearTimeout(timer);
    const writes = [...pending];
    const waiters = waiting;
    pending.clear();
    waiting = [];
    return enqueue(async () => {
      try {
        for (const [path, source] of writes) {
          await invoke("project_write_page", { dir, path, source });
        }
        waiters.forEach((waiter) => waiter.resolve());
      } catch (error) {
        waiters.forEach((waiter) => waiter.reject(error));
        throw error;
      }
    });
  };

  const fail = (error: unknown): never => {
    throw new Error(typeof error === "string" ? error : String(error));
  };

  return {
    place: "disk",
    flush,
    // The folder as a sync run uses it: in line with the app's own changes.
    folder: {
      read: async () => {
        await flush().catch(() => {});
        const project = await enqueue(() => invoke<Project>("project_load", { dir }));
        return project.pages;
      },
      write: (path, source) =>
        enqueue(() => invoke<void>("project_write_page", { dir, path, source })),
      remove: (path) => enqueue(() => invoke<void>("project_remove", { dir, path })),
    },
    load: () => invoke<Project>("project_load", { dir }).catch(fail),
    writePage: (path, source) => {
      pending.set(path, source);
      clearTimeout(timer);
      timer = setTimeout(() => void flush().catch(() => {}), WRITE_DELAY);
      return new Promise<void>((resolve, reject) =>
        waiting.push({ resolve, reject }),
      ).catch(fail);
    },
    createFolder: (path) =>
      enqueue(() => invoke<void>("project_create_folder", { dir, path })).catch(fail),
    rename: async (from, to) => {
      await flush().catch(() => {});
      return enqueue(() => invoke<void>("project_rename", { dir, from, to })).catch(
        fail,
      );
    },
    remove: async (path) => {
      // A page about to be deleted needs no last write.
      for (const key of [...pending.keys()]) {
        if (key === path || key.startsWith(`${path}/`)) pending.delete(key);
      }
      await flush().catch(() => {});
      return enqueue(() => invoke<void>("project_remove", { dir, path })).catch(fail);
    },
  };
}
