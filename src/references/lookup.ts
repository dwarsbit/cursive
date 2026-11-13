import {
  emptyReference,
  suggestKey,
  type Reference,
  type ReferenceType,
} from "./reference";

/**
 * A work found by its DOI (at Crossref) or its ISBN (at Open Library),
 * for a work that is in no library yet. Typing `@10.1038/nature14539`
 * or `@978-0-201-13447-6` in the text looks it up.
 */

export type Lookup = { kind: "doi"; id: string } | { kind: "isbn"; id: string };

const DOI = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)?(10\.\d{4,9}\/\S+)$/i;

function isbnOk(digits: string): boolean {
  if (/^\d{9}[\dX]$/.test(digits)) {
    const sum = [...digits].reduce(
      (total, ch, index) => total + (ch === "X" ? 10 : Number(ch)) * (10 - index),
      0,
    );
    return sum % 11 === 0;
  }
  if (/^97[89]\d{10}$/.test(digits)) {
    const sum = [...digits].reduce(
      (total, ch, index) => total + Number(ch) * (index % 2 ? 3 : 1),
      0,
    );
    return sum % 10 === 0;
  }
  return false;
}

/** What a typed query looks up: a DOI, an ISBN or nothing. */
export function lookupOf(query: string): Lookup | null {
  const text = query.trim().replace(/[.,;]+$/, "");
  const doi = DOI.exec(text);
  if (doi) return { kind: "doi", id: doi[1] };
  const digits = text
    .replace(/^isbn:?/i, "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
  return isbnOk(digits) ? { kind: "isbn", id: digits } : null;
}

const CROSSREF_TYPES: Record<string, ReferenceType> = {
  "journal-article": "article",
  "posted-content": "article",
  book: "book",
  monograph: "book",
  "edited-book": "book",
  "reference-book": "book",
  "book-chapter": "chapter",
  "book-section": "chapter",
  "book-part": "chapter",
  "reference-entry": "chapter",
  "proceedings-article": "conference",
  dissertation: "thesis",
  report: "report",
};

interface CrossrefName {
  family?: string;
  given?: string;
  name?: string;
}

/** A work as Crossref's `message` has it. */
export interface CrossrefWork {
  type?: string;
  title?: string[];
  author?: CrossrefName[];
  editor?: CrossrefName[];
  issued?: { "date-parts"?: Array<Array<number | null>> };
  "container-title"?: string[];
  publisher?: string;
  "publisher-location"?: string;
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
  URL?: string;
  institution?: Array<{ name?: string }>;
}

const crossrefName = (name: CrossrefName): string =>
  name.name?.trim() ||
  [name.family?.trim(), name.given?.trim()].filter(Boolean).join(", ");

/** Crossref's titles carry a little markup, such as `<i>`. */
const plain = (text: string | undefined): string =>
  (text ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function crossrefReference(
  work: CrossrefWork,
  taken: Iterable<string>,
): Reference {
  const ref = emptyReference("");
  ref.type = CROSSREF_TYPES[work.type ?? ""] ?? "other";
  ref.author = (work.author ?? []).map(crossrefName).filter(Boolean);
  ref.editor = (work.editor ?? []).map(crossrefName).filter(Boolean);
  ref.title = plain(work.title?.[0]);
  const year = work.issued?.["date-parts"]?.[0]?.[0];
  ref.year = year ? String(year) : "";
  ref.container = plain(work["container-title"]?.[0]);
  ref.publisher =
    ref.type === "thesis"
      ? plain(work.institution?.[0]?.name) || plain(work.publisher)
      : plain(work.publisher);
  ref.place = plain(work["publisher-location"]);
  ref.volume = plain(work.volume);
  ref.issue = plain(work.issue);
  ref.pages = plain(work.page).replace(/[–—]/g, "-");
  ref.doi = plain(work.DOI);
  ref.key = suggestKey(ref, taken);
  return ref;
}

/** A book as Open Library's books API has it, with `jscmd=data`. */
export interface OpenLibraryBook {
  title?: string;
  subtitle?: string;
  authors?: Array<{ name?: string }>;
  publishers?: Array<{ name?: string }>;
  publish_places?: Array<{ name?: string }>;
  publish_date?: string;
  url?: string;
}

/** "Donald E. Knuth" as "Knuth, Donald E.". */
const familyFirst = (name: string): string => {
  const words = name.trim().split(/\s+/);
  if (name.includes(",") || words.length < 2) return name.trim();
  return `${words[words.length - 1]}, ${words.slice(0, -1).join(" ")}`;
};

export function openLibraryReference(
  book: OpenLibraryBook,
  taken: Iterable<string>,
): Reference {
  const ref = emptyReference("");
  ref.type = "book";
  ref.author = (book.authors ?? [])
    .map((author) => familyFirst(author.name ?? ""))
    .filter(Boolean);
  ref.title = [book.title, book.subtitle]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(": ");
  ref.year = /\d{4}/.exec(book.publish_date ?? "")?.[0] ?? "";
  ref.publisher = book.publishers?.[0]?.name?.trim() ?? "";
  ref.place = book.publish_places?.[0]?.name?.trim() ?? "";
  ref.key = suggestKey(ref, taken);
  return ref;
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const response = await fetch(url, {
    signal: controller.signal,
    headers: { Accept: "application/json" },
  })
    .catch(() => null)
    .finally(() => clearTimeout(timer));
  if (!response) throw new Error("The lookup didn't answer. Check your connection.");
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`The lookup answered ${response.status}. Try again later.`);
  return (await response.json()) as unknown;
}

/** The work with this DOI or ISBN; null when there is none. */
export async function lookUp(
  lookup: Lookup,
  taken: Iterable<string>,
): Promise<Reference | null> {
  if (lookup.kind === "doi") {
    const data = (await getJson(
      `https://api.crossref.org/works/${lookup.id.split("/").map(encodeURIComponent).join("/")}`,
    )) as { message?: CrossrefWork } | null;
    return data?.message ? crossrefReference(data.message, taken) : null;
  }
  const key = `ISBN:${lookup.id}`;
  const data = (await getJson(
    `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(key)}&format=json&jscmd=data`,
  )) as Record<string, OpenLibraryBook> | null;
  const book = data?.[key];
  return book?.title ? openLibraryReference(book, taken) : null;
}
