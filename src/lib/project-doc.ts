import * as Y from "yjs";

/**
 * A project as the Polemic server keeps it: one Yjs document, in the
 * layout the Polemic editor uses for its projects (layout 1).
 *
 * - `texts`: file id → the file's text (a Y.Text).
 * - `paths`: file id → its path in the project.
 * - `assets`: path → a binary file by the SHA-256 of its bytes, its
 *   size and its media type. The bytes are kept on the server apart
 *   from the document. Cursive keeps a page's images and attached
 *   files here.
 * - `meta`: `layout` = 1.
 *
 * Cursive works on the pages, the `.md` files, and the assets. Anything
 * else in the document stays as it is.
 */
export const LAYOUT = 1;

const texts = (doc: Y.Doc) => doc.getMap<Y.Text>("texts");
const paths = (doc: Y.Doc) => doc.getMap<string>("paths");
const assets = (doc: Y.Doc) => doc.getMap<AssetRef>("assets");

/** A file that isn't text, as the document names it: its bytes by their hash. */
export interface AssetRef {
  /** The SHA-256 of the bytes, in lowercase hex. */
  hash: string;
  size: number;
  /** The media type, such as `image/png`. */
  type: string;
}

const isAssetRef = (value: unknown): value is AssetRef => {
  const ref = value as AssetRef | null;
  return (
    typeof ref === "object" &&
    ref !== null &&
    typeof ref.hash === "string" &&
    /^[0-9a-f]{64}$/.test(ref.hash) &&
    Number.isSafeInteger(ref.size) &&
    ref.size >= 0 &&
    typeof ref.type === "string"
  );
};

const isHidden = (path: string) => path.split("/").some((part) => part.startsWith("."));

const isPage = (path: string) =>
  /\.md$/i.test(path) && !path.split("/").some((part) => part.startsWith("."));

/** A path that stays in the project, with `/` between its parts. */
function validPath(path: unknown): path is string {
  if (typeof path !== "string" || path === "" || path.includes("\\")) return false;
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return false;
  return path
    .split("/")
    .every(
      (part) => part !== "" && part !== "." && part !== ".." && !part.includes("\0"),
    );
}

function conflictPath(path: string, id: string): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  const tag = ` (conflict ${id.slice(0, 8)})`;
  return dot > slash + 1 ? path.slice(0, dot) + tag + path.slice(dot) : path + tag;
}

/** A new, empty project document. */
export function newDoc(): Y.Doc {
  const doc = new Y.Doc();
  doc.getMap("meta").set("layout", LAYOUT);
  return doc;
}

/**
 * The document's pages: path → file id. Of two files on one path the
 * smallest id keeps it and the others become conflict copies, as on
 * the server and in every other copy of the project.
 */
export function pageIds(doc: Y.Doc): Map<string, string> {
  const claims = new Map<string, string[]>();
  for (const [id, path] of paths(doc)) {
    if (!validPath(path) || !(texts(doc).get(id) instanceof Y.Text)) continue;
    claims.set(path, [...(claims.get(path) ?? []), id]);
  }
  const found = new Map<string, string>();
  const losers: Array<[string, string]> = [];
  for (const [path, ids] of claims) {
    ids.sort();
    found.set(path, ids[0]);
    for (const id of ids.slice(1)) losers.push([conflictPath(path, id), id]);
  }
  for (const [path, id] of losers) if (!found.has(path)) found.set(path, id);
  for (const path of [...found.keys()]) if (!isPage(path)) found.delete(path);
  return found;
}

/** The document's other files: path → its bytes by their hash. A page's path wins over a file's. */
export function readAssets(doc: Y.Doc): Record<string, AssetRef> {
  const pages = pageIds(doc);
  const found: Record<string, AssetRef> = {};
  for (const [path, ref] of assets(doc)) {
    if (!validPath(path) || isHidden(path) || isPage(path) || pages.has(path)) continue;
    if (isAssetRef(ref)) found[path] = { hash: ref.hash, size: ref.size, type: ref.type };
  }
  return found;
}

/** Adds a file to the document, or points its path at other bytes. */
export function writeAsset(doc: Y.Doc, path: string, ref: AssetRef): void {
  const current = assets(doc).get(path);
  if (isAssetRef(current) && current.hash === ref.hash && current.type === ref.type) return;
  assets(doc).set(path, { hash: ref.hash, size: ref.size, type: ref.type });
}

/**
 * Brings the document's files in line with `files`: new and changed
 * ones are set, missing ones deleted.
 */
export function applyAssets(doc: Y.Doc, files: Record<string, AssetRef>): void {
  doc.transact(() => {
    for (const path of Object.keys(readAssets(doc))) {
      if (!(path in files)) assets(doc).delete(path);
    }
    for (const [path, ref] of Object.entries(files)) writeAsset(doc, path, ref);
  });
}

/** The document's pages: path → text. */
export function readPages(doc: Y.Doc): Record<string, string> {
  const pages: Record<string, string> = {};
  for (const [path, id] of pageIds(doc)) pages[path] = texts(doc).get(id)!.toString();
  return pages;
}

/**
 * Makes `text` read `next` by changing only the part that differs, so
 * what others changed elsewhere in the text at the same time is kept.
 */
export function replaceText(text: Y.Text, next: string): void {
  const current = text.toString();
  if (current === next) return;
  const max = Math.min(current.length, next.length);
  let start = 0;
  while (start < max && current.charCodeAt(start) === next.charCodeAt(start)) start++;
  let end = 0;
  while (
    end < max - start &&
    current.charCodeAt(current.length - 1 - end) ===
      next.charCodeAt(next.length - 1 - end)
  ) {
    end++;
  }
  // Never cut a pair of surrogates in two.
  const low = (code: number) => code >= 0xdc00 && code <= 0xdfff;
  if (start > 0 && low(current.charCodeAt(start))) start--;
  if (end > 0 && low(current.charCodeAt(current.length - end))) end--;
  text.delete(start, current.length - start - end);
  text.insert(start, next.slice(start, next.length - end));
}

const newId = () => crypto.randomUUID();

/** Writes one page: an edit when it exists, a new file when it does not. */
export function writeDocPage(doc: Y.Doc, path: string, source: string): void {
  doc.transact(() => {
    const id = pageIds(doc).get(path);
    if (id) {
      replaceText(texts(doc).get(id)!, source);
      return;
    }
    const fresh = newId();
    texts(doc).set(fresh, new Y.Text(source));
    paths(doc).set(fresh, path);
  });
}

/** Moves a page, or every page of a folder. A file keeps its id, so its history moves with it. */
export function renameInDoc(doc: Y.Doc, from: string, to: string): void {
  doc.transact(() => {
    for (const [path, ref] of Object.entries(readAssets(doc))) {
      if (path !== from && !path.startsWith(`${from}/`)) continue;
      assets(doc).delete(path);
      assets(doc).set(to + path.slice(from.length), ref);
    }
    for (const [path, id] of pageIds(doc)) {
      if (path === from) paths(doc).set(id, to);
      else if (path.startsWith(`${from}/`))
        paths(doc).set(id, to + path.slice(from.length));
    }
  });
}

/** Deletes a page, or every page of a folder. */
export function removeFromDoc(doc: Y.Doc, path: string): void {
  doc.transact(() => {
    for (const file of Object.keys(readAssets(doc))) {
      if (file === path || file.startsWith(`${path}/`)) assets(doc).delete(file);
    }
    for (const [page, id] of pageIds(doc)) {
      if (page !== path && !page.startsWith(`${path}/`)) continue;
      texts(doc).delete(id);
      paths(doc).delete(id);
    }
  });
}

/**
 * Brings the document's pages in line with `pages`, as edits: changed
 * pages are edited, missing ones deleted and new ones added. A page
 * that is gone from one path and new, with the same text, on another
 * was moved, and keeps its id.
 */
export function applyPages(doc: Y.Doc, pages: Record<string, string>): void {
  doc.transact(() => {
    const ids = pageIds(doc);
    const gone = new Map<string, string>();
    for (const [path, id] of ids) {
      if (!(path in pages)) gone.set(path, id);
    }
    for (const [path, source] of Object.entries(pages)) {
      const id = ids.get(path);
      if (id) {
        replaceText(texts(doc).get(id)!, source);
        continue;
      }
      const moved = [...gone].find(
        ([, old]) => texts(doc).get(old)!.toString() === source,
      );
      if (moved && source !== "") {
        paths(doc).set(moved[1], path);
        gone.delete(moved[0]);
        continue;
      }
      const fresh = newId();
      texts(doc).set(fresh, new Y.Text(source));
      paths(doc).set(fresh, path);
    }
    for (const id of gone.values()) {
      texts(doc).delete(id);
      paths(doc).delete(id);
    }
  });
}

/** One page that changed outside this window. `null` is a page that isn't there. */
export interface PageChange {
  path: string;
  /** The page before the change, as this window last saved it. */
  base: string | null;
  /** The page now. */
  text: string | null;
}

/** What turns the pages `before` into the pages `after`. */
export function diffPages(
  before: Record<string, string>,
  after: Record<string, string>,
): PageChange[] {
  const changes: PageChange[] = [];
  for (const path of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const base = before[path] ?? null;
    const text = after[path] ?? null;
    if (base !== text) changes.push({ path, base, text });
  }
  return changes;
}

/**
 * Three texts into one: what `mine` and `theirs` each changed in
 * `base`. Used when a page changed elsewhere while it was being typed
 * in here.
 */
export function mergeText(base: string, mine: string, theirs: string): string {
  if (mine === base) return theirs;
  if (theirs === base || theirs === mine) return mine;
  const origin = new Y.Doc();
  origin.getText("t").insert(0, base);
  const state = Y.encodeStateAsUpdate(origin);
  const fork = (next: string) => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, state);
    replaceText(doc.getText("t"), next);
    return doc;
  };
  const merged = fork(mine);
  Y.applyUpdate(merged, Y.encodeStateAsUpdate(fork(theirs)));
  return merged.getText("t").toString();
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};
const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export const encodeDoc = (doc: Y.Doc) => toBase64(Y.encodeStateAsUpdate(doc));
export function decodeDoc(state: string): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, fromBase64(state));
  return doc;
}
export { fromBase64, toBase64 };
