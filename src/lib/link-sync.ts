import * as Y from "yjs";
import { MAX_FILE_BYTES } from "./file-types";
import {
  applyAssets,
  applyPages,
  decodeDoc,
  diffPages,
  encodeDoc,
  newDoc,
  readAssets,
  readPages,
  type AssetRef,
  type PageChange,
} from "./project-doc";
import { ServerError, type Server } from "./server";

/**
 * Syncs a project folder with its project in the account, the way the
 * Polemic editor syncs a linked folder: in runs over HTTP, each one
 * sending what changed in the folder and bringing what changed
 * elsewhere. The folder stays the project; nothing has to stay
 * connected, and a run that fails changes nothing.
 *
 * Between runs the link keeps a copy of the project's document. A run
 * compares the folder with that copy to see what changed here, so two
 * people's changes to the same page come together instead of one
 * replacing the other.
 */

/** The folder, as a run reads and changes it. */
export interface Folder {
  /** Writes every page still waiting to be saved, then reads all pages. */
  read(): Promise<Record<string, string>>;
  write(path: string, source: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** The folder's other files, such as images, with the hash of their bytes. */
  files?(): Promise<Record<string, AssetRef>>;
  /** Called when a run changed a file, so the window shows it anew. */
  changedFile?(path: string): void;
}

/** How a run moves the bytes of files between the folder and the account. */
export interface FileTransfer {
  /** The hashes of the files the server has the bytes of. */
  stored(): Promise<Set<string>>;
  /** Sends a file of the folder to the server. */
  upload(path: string, ref: AssetRef): Promise<void>;
  /** Writes a file from the server into the folder. */
  download(path: string, ref: AssetRef): Promise<void>;
}

export interface Link {
  projectId: string;
  /** The document as of the last run (`encodeDoc`). Empty before the first. */
  state: string;
}

export interface RunResult {
  /** The link after the run, to keep for the next one. */
  link: Link;
  /** What the run changed in the folder. */
  changes: PageChange[];
  /** Whether the folder had changes the server took. */
  sent: boolean;
  /** The files the run wrote into the folder or deleted from it. */
  files: string[];
}

/** An update that holds nothing is two bytes long. */
const isEmpty = (update: Uint8Array) => update.length <= 2;

/** One run. `writable` is false for a project you can read but not change. */
export async function syncRun(
  server: Server,
  folder: Folder,
  link: Link,
  writable: boolean,
  transfer?: FileTransfer,
): Promise<RunResult> {
  const doc = link.state ? decodeDoc(link.state) : new Y.Doc();
  // Ask first: when the server can't be reached, nothing has happened yet.
  const theirs = await server.documentSync(link.projectId, Y.encodeStateVector(doc));

  const before = await folder.read();
  // Files too large for the account stay in the folder only.
  const filesBefore =
    transfer && folder.files
      ? Object.fromEntries(
          Object.entries(await folder.files()).filter(([, ref]) => ref.size <= MAX_FILE_BYTES),
        )
      : null;
  // A project you can only read takes nothing from the folder.
  if (writable) {
    applyPages(doc, before);
    if (filesBefore) applyAssets(doc, filesBefore);
  }
  Y.applyUpdate(doc, theirs.update);
  if (writable && doc.getMap("meta").get("layout") === undefined) {
    doc.getMap("meta").set("layout", newDoc().getMap("meta").get("layout"));
  }

  const after = readPages(doc);
  const changes = diffPages(before, after);
  for (const change of changes) {
    if (change.text === null) await folder.remove(change.path);
    else await folder.write(change.path, change.text);
  }

  // Files: what changed elsewhere comes into the folder.
  const files: string[] = [];
  if (transfer && filesBefore) {
    const filesAfter = readAssets(doc);
    for (const [path, ref] of Object.entries(filesAfter)) {
      if (filesBefore[path]?.hash === ref.hash) continue;
      await transfer.download(path, ref);
      files.push(path);
    }
    for (const path of Object.keys(filesBefore)) {
      if (path in filesAfter || path in after) continue;
      await folder.remove(path);
      files.push(path);
    }
    files.forEach((path) => folder.changedFile?.(path));
  }

  const mine = Y.encodeStateAsUpdate(doc, theirs.stateVector);
  const sent = writable && !isEmpty(mine);
  if (sent) {
    // The bytes go first, so every file the document names can be fetched.
    if (transfer && filesBefore) {
      const local = Object.entries(filesBefore);
      if (local.length) {
        const stored = await transfer.stored();
        const sending = new Set<string>();
        for (const [path, ref] of local) {
          if (stored.has(ref.hash) || sending.has(ref.hash)) continue;
          sending.add(ref.hash);
          await transfer.upload(path, ref);
        }
      }
    }
    await server.documentUpdate(link.projectId, mine);
  }

  return {
    link: { projectId: link.projectId, state: encodeDoc(doc) },
    changes,
    sent,
    files,
  };
}

export type SyncState =
  /** A run is under way. */
  | { kind: "syncing" }
  | { kind: "synced" }
  /** The server can't be reached; the next run tries again. */
  | { kind: "offline" }
  /** The account is signed out, here or on the server. */
  | { kind: "signed-out" }
  /** The project is gone from the account, or no longer shared. */
  | { kind: "gone" }
  | { kind: "error"; message: string };

export interface FolderSync {
  /** A run now; runs never overlap, and one asked for during a run follows it. */
  run(): Promise<void>;
  /** A run soon: called when a page was saved. */
  touch(): void;
  onChanges(listener: (changes: PageChange[]) => void): () => void;
  /** Tells of files a run changed in the folder, with every file the folder has. */
  onFiles(listener: (files: string[]) => void): () => void;
  onState(listener: (state: SyncState) => void): () => void;
  state(): SyncState;
  stop(): void;
}

const AFTER_SAVE = 2_000;
const EVERY = 15_000;

/** Keeps a folder in sync: on opening, after saves, and every little while. */
export function folderSync(options: {
  server: Server;
  folder: Folder;
  link: Link;
  writable: boolean;
  /** Moves the bytes of images and other files; without it, only pages sync. */
  transfer?: FileTransfer;
  /** Keeps the link for the next time the folder is opened. */
  saveLink: (link: Link) => Promise<void>;
}): FolderSync {
  let link = options.link;
  let state: SyncState = { kind: "syncing" };
  let running: Promise<void> | null = null;
  let again = false;
  let stopped = false;
  let soon: ReturnType<typeof setTimeout> | undefined;
  const changeListeners = new Set<(changes: PageChange[]) => void>();
  const fileListeners = new Set<(files: string[]) => void>();
  const stateListeners = new Set<(state: SyncState) => void>();

  const setState = (next: SyncState) => {
    state = next;
    stateListeners.forEach((listener) => listener(next));
  };

  const once = async () => {
    setState({ kind: "syncing" });
    try {
      const result = await syncRun(
        options.server,
        options.folder,
        link,
        options.writable,
        options.transfer,
      );
      link = result.link;
      await options.saveLink(link);
      if (result.changes.length > 0) {
        changeListeners.forEach((listener) => listener(result.changes));
      }
      if (result.files.length > 0) {
        const files = await options.folder.files?.().catch(() => null);
        if (files) fileListeners.forEach((listener) => listener(Object.keys(files).sort()));
      }
      setState({ kind: "synced" });
    } catch (error) {
      if (error instanceof ServerError && error.status === 0)
        setState({ kind: "offline" });
      else if (error instanceof ServerError && error.status === 401) {
        setState({ kind: "signed-out" });
      } else if (error instanceof ServerError && [403, 404].includes(error.status)) {
        setState({ kind: "gone" });
      } else {
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  const run = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await once();
      } while (again && !stopped);
      running = null;
    })();
    return running;
  };

  const timer = setInterval(() => void run(), EVERY);

  return {
    run,
    touch: () => {
      clearTimeout(soon);
      soon = setTimeout(() => void run(), AFTER_SAVE);
    },
    onChanges: (listener) => {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    onFiles: (listener) => {
      fileListeners.add(listener);
      return () => fileListeners.delete(listener);
    },
    onState: (listener) => {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
    state: () => state,
    stop: () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(soon);
    },
  };
}
