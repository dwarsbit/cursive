import { invoke } from "@tauri-apps/api/core";
import { mediaType } from "./file-types";
import type { Folder } from "./link-sync";
import type { AssetRef } from "./project-doc";
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

  // Files shown in the window, by path: read from disk once, until they change.
  const urls = new Map<string, Promise<string | null>>();
  const forget = (path: string) => {
    for (const [key, url] of [...urls]) {
      if (key !== path && !key.startsWith(`${path}/`)) continue;
      urls.delete(key);
      void url.then((found) => found && URL.revokeObjectURL(found));
    }
  };
  const readFile = (path: string) =>
    invoke<ArrayBuffer>("project_read_file", { dir, path }).then(
      (bytes) => URL.createObjectURL(new Blob([bytes], { type: mediaType(path) })),
      () => null,
    );
  const writeFile = async (path: string, data: Blob) => {
    const bytes = new Uint8Array(await data.arrayBuffer());
    await invoke("project_write_file", bytes, {
      headers: { dir: encodeURIComponent(dir), path: encodeURIComponent(path) },
    });
    forget(path);
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
      remove: (path) => {
        forget(path);
        return enqueue(() => invoke<void>("project_remove", { dir, path }));
      },
      files: () => enqueue(() => invoke<Record<string, AssetRef>>("project_files", { dir })),
      changedFile: forget,
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
    writeFile: (path, data) => enqueue(() => writeFile(path, data)).catch(fail),
    fileUrl: (path) => {
      let url = urls.get(path);
      if (!url) {
        url = readFile(path);
        urls.set(path, url);
      }
      return url;
    },
    openFile: (path) => invoke<void>("project_open_file", { dir, path }).catch(fail),
    rename: async (from, to) => {
      forget(from);
      await flush().catch(() => {});
      return enqueue(() => invoke<void>("project_rename", { dir, from, to })).catch(
        fail,
      );
    },
    remove: async (path) => {
      forget(path);
      // A page about to be deleted needs no last write.
      for (const key of [...pending.keys()]) {
        if (key === path || key.startsWith(`${path}/`)) pending.delete(key);
      }
      await flush().catch(() => {});
      return enqueue(() => invoke<void>("project_remove", { dir, path })).catch(fail);
    },
  };
}
