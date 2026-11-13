import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";
import type { Project, ProjectStore } from "./project";
import { mediaType } from "@cursive/editor/lib/file-types";
import {
  diffPages,
  LAYOUT,
  readAssets,
  readPages,
  removeFromDoc,
  renameInDoc,
  writeAsset,
  writeDocPage,
  type AssetRef,
  type PageChange,
} from "./project-doc";
import { browserSaveFile, type Server } from "./server";
import { distinctSnapshots, type PageHistory, type PageSnapshot } from "./page-history";

/** How many of the server's snapshots a page's history looks through. */
const ACCOUNT_SNAPSHOTS = 40;

/** The SHA-256 of some bytes, in lowercase hex. */
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
  const fileListeners = new Set<(files: string[]) => void>();
  // The files as the app last saw them.
  let seenFiles: Record<string, AssetRef> = {};
  const assetUrl = (ref: AssetRef) =>
    `/api/projects/${encodeURIComponent(id)}/assets/${ref.hash}`;
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
    const files = readAssets(doc);
    const changed =
      Object.keys(files).length !== Object.keys(seenFiles).length ||
      Object.entries(files).some(([path, ref]) => seenFiles[path]?.hash !== ref.hash);
    seenFiles = files;
    if (changed && origin !== LOCAL) {
      const list = Object.keys(files).sort();
      fileListeners.forEach((listener) => listener(list));
    }
  });

  const change = (work: () => void) => {
    doc.transact(work, LOCAL);
    return Promise.resolve();
  };

  // The snapshots the server keeps of the whole project, read once each.
  const snapshots = new Map<string, Promise<Record<string, string>>>();
  const snapshotPages = (snapshotId: string) => {
    let found = snapshots.get(snapshotId);
    if (!found) {
      found = server.snapshot(id, snapshotId);
      found.catch(() => snapshots.delete(snapshotId));
      snapshots.set(snapshotId, found);
    }
    return found;
  };
  const history: PageHistory = {
    list: async (path) => {
      const list = (await server.history(id)).slice(0, ACCOUNT_SNAPSHOTS);
      const found: PageSnapshot[] = [];
      // A few at a time, so a long history doesn't hold up the server.
      for (let at = 0; at < list.length; at += 4) {
        const batch = list.slice(at, at + 4);
        const pages = await Promise.all(batch.map((item) => snapshotPages(item.id)));
        batch.forEach((item, index) => {
          const source = pages[index][path];
          if (source !== undefined) {
            found.push({ id: item.id, at: Date.parse(item.createdAt), source });
          }
        });
      }
      return distinctSnapshots(found);
    },
    restore: (path, snapshot) => server.restore(id, snapshot.id, [path]),
  };

  return {
    place: "account",
    history,
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
      seenFiles = readAssets(doc);
      return {
        name: info.name,
        folders,
        pages: { ...seen },
        files: Object.keys(seenFiles).sort(),
      };
    },
    onFiles: (listener) => {
      fileListeners.add(listener);
      return () => fileListeners.delete(listener);
    },
    writeFile: async (path, data) => {
      const bytes = new Uint8Array(await data.arrayBuffer());
      const type = data.type || mediaType(path);
      const hash = await sha256(bytes);
      // The bytes go first, so every file the document names can be fetched.
      await server.uploadAsset(id, hash, bytes, type);
      await change(() => writeAsset(doc, path, { hash, size: bytes.length, type }));
    },
    fileUrl: async (path) => {
      const ref = readAssets(doc)[path];
      return ref ? assetUrl(ref) : null;
    },
    openFile: async (path) => {
      const ref = readAssets(doc)[path];
      if (ref) await browserSaveFile(assetUrl(ref), path.slice(path.lastIndexOf("/") + 1));
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
