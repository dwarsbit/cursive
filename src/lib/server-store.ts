import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import type { Project, ProjectStore } from "./project";
import {
  diffPages,
  LAYOUT,
  readPages,
  removeFromDoc,
  renameInDoc,
  writeDocPage,
  type PageChange,
} from "./project-doc";
import type { Server } from "./server";

/** How the project's document reaches the server. Tests connect their own. */
export interface Connection {
  /** How many changes the server doesn't have yet. */
  unsynced(): number;
  onUnsynced(listener: () => void): void;
  close(): void;
}

export type Connect = (id: string, doc: Y.Doc) => Promise<Connection>;

/** The server's sync address: the page's own host, signed in by the session cookie. */
export const connectToServer: Connect = (id, doc) =>
  new Promise((resolve, reject) => {
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const listeners = new Set<() => void>();
    const timer = setTimeout(() => {
      provider.destroy();
      reject(
        new Error("Could not load the project. Check your connection and try again."),
      );
    }, 30_000);
    const provider = new HocuspocusProvider({
      url: `${scheme}://${window.location.host}/api/sync`,
      name: id,
      // The session cookie signs the connection in.
      token: "",
      document: doc,
      onSynced: () => {
        clearTimeout(timer);
        resolve({
          unsynced: () => provider.unsyncedChanges,
          onUnsynced: (listener) => listeners.add(listener),
          close: () => provider.destroy(),
        });
      },
      onUnsyncedChanges: () => listeners.forEach((listener) => listener()),
      onAuthenticationFailed: () => {
        clearTimeout(timer);
        provider.destroy();
        reject(new Error("This project doesn't exist or isn't shared with you."));
      },
    });
  });

/**
 * A project in the account, open in the browser: the project's
 * document, kept in step with the server while the page is open. What
 * is typed here reaches other windows as it is typed, and their
 * changes arrive through `subscribe`.
 */
export function serverStore(
  server: Server,
  id: string,
  connect: Connect = connectToServer,
): ProjectStore & {
  /** Whether everything typed has reached the server. */
  saved(): boolean;
  onSaved(listener: () => void): void;
  close(): void;
} {
  const doc = new Y.Doc();
  const LOCAL = "cursive";
  const listeners = new Set<(changes: PageChange[]) => void>();
  let connection: Connection | null = null;
  let closed = false;
  // The pages as the app last saw them.
  let seen: Record<string, string> = {};
  // Empty folders live in this window only: the document keeps pages.
  let folders: string[] = [];
  const savedListeners = new Set<() => void>();

  doc.on("update", (_update: Uint8Array, origin: unknown) => {
    const pages = readPages(doc);
    const changes = origin === LOCAL ? [] : diffPages(seen, pages);
    seen = pages;
    if (changes.length > 0) listeners.forEach((listener) => listener(changes));
  });

  const change = (work: () => void) => {
    doc.transact(work, LOCAL);
    return Promise.resolve();
  };

  return {
    place: "account",
    load: async (): Promise<Project> => {
      const [info, opened] = await Promise.all([server.project(id), connect(id, doc)]);
      if (closed) {
        opened.close();
        throw new Error("The project was closed.");
      }
      connection = opened;
      opened.onUnsynced(() => savedListeners.forEach((listener) => listener()));
      if (info.writable && doc.getMap("meta").get("layout") === undefined) {
        doc.transact(() => doc.getMap("meta").set("layout", LAYOUT), LOCAL);
      }
      seen = readPages(doc);
      return { name: info.name, folders, pages: { ...seen } };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    writePage: (path, source) => change(() => writeDocPage(doc, path, source)),
    createFolder: async (path) => {
      if (!folders.includes(path)) folders = [...folders, path];
    },
    rename: (from, to) => {
      folders = folders.map((folder) =>
        folder === from
          ? to
          : folder.startsWith(`${from}/`)
            ? to + folder.slice(from.length)
            : folder,
      );
      return change(() => renameInDoc(doc, from, to));
    },
    remove: (path) => {
      folders = folders.filter(
        (folder) => folder !== path && !folder.startsWith(`${path}/`),
      );
      return change(() => removeFromDoc(doc, path));
    },
    saved: () => (connection?.unsynced() ?? 0) === 0,
    onSaved: (listener) => void savedListeners.add(listener),
    close: () => {
      closed = true;
      connection?.close();
      doc.destroy();
    },
  };
}
