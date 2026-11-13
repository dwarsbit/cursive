import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { isDesktop } from "../lib/platform";
import { bibtexReferences } from "./bibtex";
import type { Reference } from "./reference";
import type { ZoteroGroup, ZoteroSource } from "./zotero";

/**
 * Where citing searches, set in Settings: Zotero (the app or a library
 * at zotero.org, with its group libraries) and BibTeX files. The list
 * lives in this app's storage. In the desktop app an API key goes to
 * the system's credential store, as the account's token does, and a
 * BibTeX file is read from its place on each search; in a browser the
 * key and a copy of the file stay in the browser, as nothing else could
 * keep them.
 */
const STORAGE = "cursive.zotero";
const BIB_STORAGE = "cursive.bibtex.";

/** A BibTeX file: on the desktop its path, in a browser a copy kept with the list. */
export interface BibSource {
  id: string;
  kind: "bibtex";
  enabled: boolean;
  /** The file's name, as Settings shows it. */
  name: string;
  /** Where the desktop app reads it. */
  path?: string;
}

export type Source = ZoteroSource | BibSource;

type Stored =
  | { id: string; kind: "app"; enabled: boolean; groups?: ZoteroGroup[] }
  | {
      id: string;
      kind: "cloud";
      enabled: boolean;
      label: string;
      userId: string;
      apiKey?: string;
      groups?: ZoteroGroup[];
    }
  | BibSource;

let sources: Source[] = [];
let loaded = false;
const listeners = new Set<() => void>();

const KINDS = new Set(["app", "cloud", "bibtex"]);

const readGroups = (value: unknown): ZoteroGroup[] =>
  Array.isArray(value)
    ? value
        .filter(
          (group): group is ZoteroGroup =>
            typeof group === "object" &&
            group !== null &&
            typeof (group as ZoteroGroup).id === "string",
        )
        .map((group) => ({
          id: group.id,
          name: String(group.name ?? ""),
          enabled: group.enabled === true,
        }))
    : [];

function readStored(): Stored[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is Stored =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Stored).id === "string" &&
        KINDS.has((entry as Stored).kind),
    );
  } catch {
    return [];
  }
}

function writeStored(list: Source[]): void {
  const stored: Stored[] = list.map((source) =>
    source.kind === "cloud" && isDesktop ? { ...source, apiKey: undefined } : source,
  );
  try {
    localStorage.setItem(STORAGE, JSON.stringify(stored));
  } catch {
    // Storage is full or off: the sources last until the app closes.
  }
}

const emit = () => listeners.forEach((listener) => listener());

/** Reads the sources and, in the desktop app, their keys. */
export async function loadSources(): Promise<Source[]> {
  if (loaded) return sources;
  const stored = readStored();
  sources = await Promise.all(
    stored.map(async (entry): Promise<Source> => {
      if (entry.kind === "bibtex")
        return {
          id: entry.id,
          kind: "bibtex",
          enabled: entry.enabled !== false,
          name: String(entry.name ?? ""),
          path: typeof entry.path === "string" ? entry.path : undefined,
        };
      const groups = readGroups(entry.groups);
      if (entry.kind === "app")
        return { id: entry.id, kind: "app", enabled: entry.enabled !== false, groups };
      let apiKey = entry.apiKey ?? "";
      if (isDesktop) {
        apiKey =
          (await invoke<string | null>("zotero_key_get", { id: entry.id }).catch(
            () => null,
          )) ?? "";
      }
      return {
        id: entry.id,
        kind: "cloud",
        enabled: entry.enabled !== false,
        label: entry.label ?? "",
        userId: entry.userId ?? "",
        apiKey,
        groups,
      };
    }),
  );
  loaded = true;
  emit();
  return sources;
}

/** Adds a source or puts it in place of the one with its id. */
export async function saveSource(source: Source): Promise<void> {
  await loadSources();
  if (source.kind === "cloud" && isDesktop) {
    await invoke("zotero_key_set", { id: source.id, key: source.apiKey });
  }
  const at = sources.findIndex((other) => other.id === source.id);
  sources =
    at < 0
      ? [...sources, source]
      : sources.map((other, i) => (i === at ? source : other));
  writeStored(sources);
  emit();
}

export async function removeSource(id: string): Promise<void> {
  await loadSources();
  const gone = sources.find((source) => source.id === id);
  if (gone?.kind === "cloud" && isDesktop) {
    await invoke("zotero_key_delete", { id }).catch(() => {});
  }
  if (gone?.kind === "bibtex") {
    try {
      localStorage.removeItem(BIB_STORAGE + id);
    } catch {
      // Nothing was kept.
    }
    parsed.delete(id);
  }
  sources = sources.filter((source) => source.id !== id);
  writeStored(sources);
  emit();
}

/** The sources, kept up to date. Empty until they are loaded. */
export function useSources(): Source[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      if (!loaded) void loadSources();
      return () => listeners.delete(listener);
    },
    () => sources,
  );
}

/** The Zotero sources a search or a check asks, the Zotero app first. */
export async function activeSources(): Promise<ZoteroSource[]> {
  const all = await loadSources();
  return all
    .filter((source): source is ZoteroSource => source.kind !== "bibtex")
    .filter((source) => source.enabled)
    .filter((source) =>
      source.kind === "app" ? isDesktop : source.userId && source.apiKey,
    )
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "app" ? -1 : 1));
}

/** The BibTeX files a search reads. */
export async function activeBibFiles(): Promise<BibSource[]> {
  const all = await loadSources();
  return all.filter(
    (source): source is BibSource => source.kind === "bibtex" && source.enabled,
  );
}

export const sourceName = (source: Source): string =>
  source.kind === "bibtex"
    ? source.name || "BibTeX file"
    : source.kind === "app"
      ? "Zotero app"
      : source.label || "Zotero cloud";

// ---------- BibTeX files ----------

/** The works of each file, kept while its text stays the same. */
const parsed = new Map<string, { text: string; refs: Reference[] }>();

/** Keeps a browser's copy of a file. Throws when the browser has no room for it. */
export function keepBibText(id: string, text: string): void {
  try {
    localStorage.setItem(BIB_STORAGE + id, text);
  } catch {
    throw new Error("This file is too large to keep in the browser.");
  }
  parsed.delete(id);
}

async function bibText(source: BibSource): Promise<string> {
  if (isDesktop && source.path)
    return invoke<string>("bibtex_read", { path: source.path });
  return localStorage.getItem(BIB_STORAGE + source.id) ?? "";
}

/** The works in a BibTeX file, read again from its place. */
export async function readBibFile(source: BibSource): Promise<Reference[]> {
  const text = await bibText(source);
  const known = parsed.get(source.id);
  if (known?.text === text) return known.refs;
  const refs = bibtexReferences(text);
  parsed.set(source.id, { text, refs });
  return refs;
}
