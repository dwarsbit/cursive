import { isSeq, parseDocument, stringify } from "yaml";

/**
 * References: what a page cites, copied into the page so it reads
 * without Zotero.
 *
 * A citation is written the way Pandoc writes one, `[@vaswani2017]` or
 * `[@vaswani2017, p. 4; @lee2020]`. The page's references sit in a
 * `bibliography` fence with a YAML list inside. A reference that came
 * from Zotero keeps the item's key and version under `zotero`, so
 * Cursive can tell when the item changed there. The server reads the
 * same fence when it publishes a site (dwarsbit/polemic-server,
 * apps/api/src/sites/references.ts).
 *
 *     ```bibliography
 *     - key: vaswani2017
 *       type: article
 *       author:
 *         - Vaswani, Ashish
 *       title: Attention is all you need
 *       year: "2017"
 *       container: Advances in Neural Information Processing Systems
 *       zotero:
 *         library: users/123456
 *         item: ABCD2345
 *         version: 1204
 *     ```
 */
export type ReferenceType =
  | "article"
  | "book"
  | "chapter"
  | "conference"
  | "thesis"
  | "report"
  | "webpage"
  | "other";

export const REFERENCE_TYPES: ReferenceType[] = [
  "article",
  "book",
  "chapter",
  "conference",
  "thesis",
  "report",
  "webpage",
  "other",
];

/** Where a reference came from in Zotero. */
export interface ZoteroLink {
  /** `local` for the Zotero app, else the library, like `users/123456`. */
  library: string;
  /** The item's key in Zotero. */
  item: string;
  /** The item's version when it was copied, or when its changes were last seen. */
  version: number;
}

export interface Reference {
  /** What citations name it by: `[@key]`. */
  key: string;
  type: ReferenceType;
  /** Names as "Family, Given"; an organization as its name. */
  author: string[];
  editor: string[];
  title: string;
  /** The year, or empty: APA writes "n.d.". */
  year: string;
  /** The journal, the book a chapter is in, the proceedings or the website. */
  container: string;
  publisher: string;
  place: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  url: string;
  /** A thesis's kind ("Doctoral dissertation") or a report's number. */
  genre: string;
  zotero: ZoteroLink | null;
}

const TEXT_FIELDS = [
  "title",
  "year",
  "container",
  "publisher",
  "place",
  "volume",
  "issue",
  "pages",
  "doi",
  "url",
  "genre",
] as const;

export const emptyReference = (key: string): Reference => ({
  key,
  type: "other",
  author: [],
  editor: [],
  title: "",
  year: "",
  container: "",
  publisher: "",
  place: "",
  volume: "",
  issue: "",
  pages: "",
  doi: "",
  url: "",
  genre: "",
  zotero: null,
});

const text = (value: unknown): string =>
  typeof value === "string"
    ? value.trim()
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : "";

const names = (value: unknown): string[] =>
  (Array.isArray(value) ? value : value === undefined ? [] : [value])
    .map(text)
    .filter(Boolean);

function readLink(value: unknown): ZoteroLink | null {
  if (typeof value !== "object" || value === null) return null;
  const data = value as Record<string, unknown>;
  const item = text(data.item);
  if (!/^[A-Z0-9]{8}$/.test(item)) return null;
  const version = Number(data.version);
  return {
    library: text(data.library) || "local",
    item,
    version: Number.isFinite(version) && version >= 0 ? Math.round(version) : 0,
  };
}

/** One entry of the list; null when it has no key. */
function readEntry(value: unknown): Reference | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const key = text(data.key).replace(/^@/, "");
  if (!isKey(key)) return null;
  const ref = emptyReference(key);
  const type = text(data.type) as ReferenceType;
  ref.type = REFERENCE_TYPES.includes(type) ? type : "other";
  ref.author = names(data.author);
  ref.editor = names(data.editor);
  for (const field of TEXT_FIELDS) ref[field] = text(data[field]);
  ref.zotero = readLink(data.zotero);
  return ref;
}

/**
 * Reads a bibliography fence's YAML. Null when it isn't a list, so
 * the fence stays a code block; entries without a key are left out.
 */
export function readBibliography(source: string): Reference[] | null {
  if (!source.trim()) return [];
  try {
    const doc = parseDocument(source);
    if (doc.errors.length > 0) return null;
    if (doc.contents === null) return [];
    if (!isSeq(doc.contents)) return null;
    const seen = new Set<string>();
    const refs: Reference[] = [];
    for (const entry of doc.toJS() as unknown[]) {
      const ref = readEntry(entry);
      if (!ref || seen.has(ref.key)) continue;
      seen.add(ref.key);
      refs.push(ref);
    }
    return refs;
  } catch {
    return null;
  }
}

/** One reference as YAML data: empty fields are left out. */
function entryData(ref: Reference): Record<string, unknown> {
  const data: Record<string, unknown> = { key: ref.key, type: ref.type };
  if (ref.author.length) data.author = ref.author;
  if (ref.editor.length) data.editor = ref.editor;
  for (const field of TEXT_FIELDS) if (ref[field]) data[field] = ref[field];
  if (ref.zotero) data.zotero = { ...ref.zotero };
  return data;
}

/** The references as a bibliography fence's YAML. */
export function writeBibliography(refs: Reference[]): string {
  if (!refs.length) return "";
  return stringify(refs.map(entryData), { lineWidth: 0 }).trimEnd();
}

/** Puts a reference in place of the one with its key, or at the end. */
export function putReference(refs: Reference[], ref: Reference): Reference[] {
  const at = refs.findIndex((other) => other.key === ref.key);
  if (at < 0) return [...refs, ref];
  return refs.map((other, index) => (index === at ? ref : other));
}

// ---------- Fences ----------

const FENCE = /^(`{3,})bibliography[ \t]*\n([\s\S]*?)(?<=\n)\1[ \t]*(?:\n|$)/;
const EMPTY_FENCE = /^(`{3,})bibliography[ \t]*\n\1[ \t]*(?:\n|$)/;

/** The bibliography fence at the start of `src`, when its YAML reads as a list. */
export function matchBibliography(src: string): { raw: string; source: string } | null {
  const empty = EMPTY_FENCE.exec(src);
  if (empty) return { raw: empty[0], source: "" };
  const match = FENCE.exec(src);
  if (!match) return null;
  const source = match[2].replace(/\n$/, "");
  return readBibliography(source) ? { raw: match[0], source } : null;
}

export const toBibliographyFence = (source: string): string => {
  const body = source.replace(/\s+$/, "");
  return body ? `\`\`\`bibliography\n${body}\n\`\`\`` : "```bibliography\n```";
};

const FENCE_ANYWHERE = /^(`{3,})bibliography[ \t]*\n(?:([\s\S]*?)\n)?\1[ \t]*$/gm;

/** Every reference in a page's Markdown, from all its bibliography fences. */
export function pageReferences(markdown: string): Reference[] {
  let refs: Reference[] = [];
  for (const match of markdown.replace(/\r\n?/g, "\n").matchAll(FENCE_ANYWHERE)) {
    for (const ref of readBibliography(match[2] ?? "") ?? []) {
      if (!refs.some((other) => other.key === ref.key)) refs = [...refs, ref];
    }
  }
  return refs;
}

/**
 * Adds a reference to the first bibliography fence of some Markdown.
 * Null when the Markdown has none.
 */
export function addToFence(markdown: string, ref: Reference): string | null {
  const pattern = new RegExp(FENCE_ANYWHERE.source, "m");
  const match = pattern.exec(markdown);
  if (!match) return null;
  const refs = putReference(readBibliography(match[2] ?? "") ?? [], ref);
  const fence = toBibliographyFence(writeBibliography(refs));
  return (
    markdown.slice(0, match.index) +
    fence +
    markdown.slice(match.index + match[0].length)
  );
}

// ---------- Citations ----------

export interface CiteItem {
  key: string;
  /** What follows the key: "p. 4", "chap. 2". */
  locator: string;
}

const KEY = /^[\p{L}\p{N}_][\p{L}\p{N}_:.#$%&+?<>~/-]*$/u;
export const isKey = (key: string) => KEY.test(key) && !/[.:#$%&+?<>~/-]$/.test(key);

/** The citation at the start of `src`: `[@key]`, `[@a, p. 4; @b]`. */
export function matchCitation(src: string): { raw: string; items: CiteItem[] } | null {
  const match = /^\[(@[^\]\n]+)\](?![([])/.exec(src);
  if (!match) return null;
  const items: CiteItem[] = [];
  for (const part of match[1].split(";")) {
    const item = /^\s*@([^\s,;]+)\s*(?:,\s*(.*?))?\s*$/u.exec(part);
    if (!item || !isKey(item[1])) return null;
    items.push({ key: item[1], locator: item[2] ?? "" });
  }
  return { raw: match[0], items };
}

export const writeCitation = (items: CiteItem[]): string =>
  `[${items
    .map((item) => (item.locator ? `@${item.key}, ${item.locator}` : `@${item.key}`))
    .join("; ")}]`;

/** The keys a page's Markdown cites, outside code. */
export function citedKeys(markdown: string): Set<string> {
  const keys = new Set<string>();
  const outside = markdown.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, "");
  for (const match of outside.matchAll(/\[@[^\]\n]+\]/g)) {
    for (const item of matchCitation(match[0])?.items ?? []) keys.add(item.key);
  }
  return keys;
}

// ---------- Keys ----------

/** A name's family part: "Vaswani, Ashish" is Vaswani. */
export const familyName = (name: string): string => name.split(",")[0].trim();

/**
 * A new citation key: the first author's family name and the year,
 * like `vaswani2017`, with a letter added when the page has it already.
 */
export function suggestKey(
  ref: Pick<Reference, "author" | "editor" | "title" | "year">,
  taken: Iterable<string>,
): string {
  const who = ref.author[0] ?? ref.editor[0] ?? ref.title.split(/\s+/)[0] ?? "";
  const stem =
    familyName(who)
      .replace(/[øØ]/g, "o")
      .replace(/[æÆ]/g, "ae")
      .replace(/ß/g, "ss")
      .replace(/[łŁ]/g, "l")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24) || "ref";
  const base = `${stem}${ref.year.replace(/\D/g, "").slice(0, 4)}`;
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 0; n < 26 * 27; n++) {
    const suffix =
      n < 26
        ? String.fromCharCode(97 + n)
        : String.fromCharCode(96 + Math.floor(n / 26)) +
          String.fromCharCode(97 + (n % 26));
    if (!used.has(base + suffix)) return base + suffix;
  }
  return `${base}${Date.now()}`;
}

/** Whether two references say the same, leaving their keys and Zotero versions aside. */
export function sameContent(a: Reference, b: Reference): boolean {
  const strip = (ref: Reference) =>
    JSON.stringify({ ...entryData(ref), key: "", zotero: ref.zotero?.item ?? null });
  return strip(a) === strip(b);
}
