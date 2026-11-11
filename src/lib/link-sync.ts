import * as Y from "yjs";
import {
  applyPages,
  decodeDoc,
  diffPages,
  encodeDoc,
  newDoc,
  readPages,
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
}

/** An update that holds nothing is two bytes long. */
const isEmpty = (update: Uint8Array) => update.length <= 2;

/** One run. `writable` is false for a project you can read but not change. */
export async function syncRun(
  server: Server,
  folder: Folder,
  link: Link,
  writable: boolean,
): Promise<RunResult> {
  const doc = link.state ? decodeDoc(link.state) : new Y.Doc();
  // Ask first: when the server can't be reached, nothing has happened yet.
  const theirs = await server.documentSync(link.projectId, Y.encodeStateVector(doc));

  const before = await folder.read();
  // A project you can only read takes nothing from the folder.
  if (writable) applyPages(doc, before);
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

  const mine = Y.encodeStateAsUpdate(doc, theirs.stateVector);
  const sent = writable && !isEmpty(mine);
  if (sent) await server.documentUpdate(link.projectId, mine);

  return { link: { projectId: link.projectId, state: encodeDoc(doc) }, changes, sent };
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
      );
      link = result.link;
      await options.saveLink(link);
      if (result.changes.length > 0) {
        changeListeners.forEach((listener) => listener(result.changes));
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
