import { invoke } from "@tauri-apps/api/core";
import {
  emptyReference,
  suggestKey,
  type Reference,
  type ReferenceType,
} from "./reference";

/**
 * Zotero, as Polemic connects to it (dwarsbit/polemic, src/lib/zotero.ts):
 * the Zotero app on this computer (its local API at 127.0.0.1:23119,
 * no key) or a library at zotero.org (the Web API, with a user ID and
 * an API key). Nothing is synced: a search asks Zotero, and what is
 * picked is copied into the page.
 */

export interface ZoteroCreator {
  creatorType: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

/** An item's data as both Zotero APIs return it. */
export interface ZoteroItem {
  key: string;
  version: number;
  itemType: string;
  title?: string;
  creators?: ZoteroCreator[];
  date?: string;
  publicationTitle?: string;
  bookTitle?: string;
  proceedingsTitle?: string;
  conferenceName?: string;
  websiteTitle?: string;
  blogTitle?: string;
  forumTitle?: string;
  repository?: string;
  publisher?: string;
  university?: string;
  institution?: string;
  place?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  DOI?: string;
  url?: string;
  thesisType?: string;
  reportNumber?: string;
  extra?: string;
}

/** A place to search: the Zotero app or a library at zotero.org. */
export type ZoteroSource =
  | { id: string; kind: "app"; enabled: boolean }
  | {
      id: string;
      kind: "cloud";
      enabled: boolean;
      label: string;
      userId: string;
      apiKey: string;
    };

/** The library a source's items are in, as a reference keeps it. */
export const libraryOf = (source: ZoteroSource): string =>
  source.kind === "app" ? "local" : `users/${source.userId}`;

const TYPES: Record<string, ReferenceType> = {
  journalArticle: "article",
  magazineArticle: "article",
  newspaperArticle: "article",
  preprint: "article",
  book: "book",
  bookSection: "chapter",
  encyclopediaArticle: "chapter",
  dictionaryEntry: "chapter",
  conferencePaper: "conference",
  thesis: "thesis",
  report: "report",
  webpage: "webpage",
  blogPost: "webpage",
  forumPost: "webpage",
};

/** Items that aren't works to cite. */
const SKIPPED = new Set(["attachment", "note", "annotation"]);

const creatorName = (creator: ZoteroCreator): string => {
  if (creator.name?.trim()) return creator.name.trim();
  const family = (creator.lastName ?? "").trim();
  const given = (creator.firstName ?? "").trim();
  return family && given ? `${family}, ${given}` : family || given;
};

/** The first four-digit year in a Zotero date: "June 2017" is 2017. */
export const zoteroYear = (date: string | undefined): string =>
  /\b(\d{4})\b/.exec(date ?? "")?.[1] ?? "";

const clean = (value: string | undefined) => (value ?? "").trim();

/**
 * A Zotero item as a reference. The key is new (surname and year, not
 * one of `taken`); a reference that had the item already keeps its own.
 */
export function zoteroReference(
  item: ZoteroItem,
  library: string,
  taken: Iterable<string>,
  key?: string,
): Reference {
  const ref = emptyReference("");
  ref.type = TYPES[item.itemType] ?? "other";
  const creators = item.creators ?? [];
  const of = (type: string) =>
    creators
      .filter((creator) => creator.creatorType === type)
      .map(creatorName)
      .filter(Boolean);
  ref.author = of("author");
  if (!ref.author.length)
    ref.author = [...of("presenter"), ...of("director"), ...of("artist")];
  ref.editor = of("editor");
  ref.title = clean(item.title);
  ref.year = zoteroYear(item.date);
  ref.container = clean(
    item.publicationTitle ||
      item.bookTitle ||
      item.proceedingsTitle ||
      item.conferenceName ||
      item.websiteTitle ||
      item.blogTitle ||
      item.forumTitle ||
      item.repository,
  );
  ref.publisher = clean(item.publisher || item.university || item.institution);
  ref.place = clean(item.place);
  ref.volume = clean(item.volume);
  ref.issue = clean(item.issue);
  ref.pages = clean(item.pages);
  ref.doi = clean(item.DOI);
  ref.url = clean(item.url);
  ref.genre = clean(item.thesisType || item.reportNumber);
  ref.zotero = { library, item: item.key, version: item.version };
  ref.key = key ?? suggestKey(ref, taken);
  return ref;
}

// ---------- The two APIs ----------

const WEB = "https://api.zotero.org";

function toItems(payload: unknown): ZoteroItem[] {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((entry) => (entry as { data?: ZoteroItem } | null)?.data)
    .filter(
      (data): data is ZoteroItem =>
        typeof data === "object" &&
        data !== null &&
        typeof data.key === "string" &&
        !SKIPPED.has(data.itemType),
    );
}

/** One GET of the local API. The app drops requests from a web page, so the desktop app asks it. */
async function localGet(path: string, query: URLSearchParams): Promise<unknown> {
  const body = await invoke<string>("zotero_local_fetch", {
    path,
    query: query.toString(),
  });
  return JSON.parse(body) as unknown;
}

async function webGet(
  source: Extract<ZoteroSource, { kind: "cloud" }>,
  path: string,
  query: URLSearchParams,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const response = await fetch(
    `${WEB}/users/${encodeURIComponent(source.userId)}/${path}?${query}`,
    {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Zotero-API-Key": source.apiKey,
        "Zotero-API-Version": "3",
      },
    },
  )
    .catch(() => null)
    .finally(() => clearTimeout(timer));
  if (!response) throw new Error("zotero.org didn't answer. Check your connection.");
  if (response.status === 403)
    throw new Error("Zotero turned the key down. Check it in Settings.");
  if (!response.ok)
    throw new Error(`Zotero answered ${response.status}. Try again later.`);
  return (await response.json()) as unknown;
}

function get(
  source: ZoteroSource,
  path: string,
  query: URLSearchParams,
): Promise<unknown> {
  return source.kind === "app"
    ? localGet(`users/0/${path}`, query)
    : webGet(source, path, query);
}

/** Items whose title, creators or year match what was typed. */
export async function searchZotero(
  source: ZoteroSource,
  text: string,
  limit = 12,
): Promise<ZoteroItem[]> {
  const query = new URLSearchParams({
    format: "json",
    limit: String(limit),
    q: text.trim(),
  });
  if (!text.trim()) query.delete("q");
  query.set("sort", "dateModified");
  return toItems(await get(source, "items/top", query));
}

/** The items with these keys, as Zotero has them now. Missing keys are deleted items. */
export async function fetchZoteroItems(
  source: ZoteroSource,
  keys: string[],
): Promise<ZoteroItem[]> {
  const items: ZoteroItem[] = [];
  for (let at = 0; at < keys.length; at += 50) {
    const query = new URLSearchParams({
      format: "json",
      itemKey: keys.slice(at, at + 50).join(","),
      includeTrashed: "0",
    });
    items.push(...toItems(await get(source, "items", query)));
  }
  return items;
}

/** Whether the Zotero app answers on this computer. */
export async function zoteroAppAnswers(): Promise<boolean> {
  try {
    await localGet("users/0/items", new URLSearchParams({ limit: "1" }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks an API key: Zotero says whose it is, which fills in the user
 * ID. Null when the key is wrong or zotero.org can't be reached.
 */
export async function checkZoteroKey(
  apiKey: string,
): Promise<{ userId: string; username: string } | null> {
  try {
    const response = await fetch(`${WEB}/keys/${encodeURIComponent(apiKey.trim())}`, {
      headers: { Accept: "application/json", "Zotero-API-Version": "3" },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { userID?: number; username?: string };
    if (data.userID === undefined) return null;
    return { userId: String(data.userID), username: data.username ?? "" };
  } catch {
    return null;
  }
}
