import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { isDesktop } from "@/lib/desktop-store";
import type { ZoteroSource } from "./zotero";

/**
 * The Zotero sources, set in Settings. The list lives in this app's
 * storage. In the desktop app an API key goes to the system's
 * credential store, as the account's token does; in a browser it stays
 * in the browser with the list, as nothing else could keep it.
 */
const STORAGE = "cursive.zotero";

type Stored =
  | { id: string; kind: "app"; enabled: boolean }
  | {
      id: string;
      kind: "cloud";
      enabled: boolean;
      label: string;
      userId: string;
      apiKey?: string;
    };

let sources: ZoteroSource[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function readStored(): Stored[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is Stored =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Stored).id === "string" &&
        ((entry as Stored).kind === "app" || (entry as Stored).kind === "cloud"),
    );
  } catch {
    return [];
  }
}

function writeStored(list: ZoteroSource[]): void {
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
export async function loadSources(): Promise<ZoteroSource[]> {
  if (loaded) return sources;
  const stored = readStored();
  sources = await Promise.all(
    stored.map(async (entry): Promise<ZoteroSource> => {
      if (entry.kind === "app")
        return { id: entry.id, kind: "app", enabled: entry.enabled !== false };
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
      };
    }),
  );
  loaded = true;
  emit();
  return sources;
}

/** Adds a source or puts it in place of the one with its id. */
export async function saveSource(source: ZoteroSource): Promise<void> {
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
  sources = sources.filter((source) => source.id !== id);
  writeStored(sources);
  emit();
}

/** The sources, kept up to date. Empty until they are loaded. */
export function useSources(): ZoteroSource[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      if (!loaded) void loadSources();
      return () => listeners.delete(listener);
    },
    () => sources,
  );
}

/** The sources a search or a check asks, the Zotero app first. */
export async function activeSources(): Promise<ZoteroSource[]> {
  const all = await loadSources();
  return all
    .filter((source) => source.enabled)
    .filter((source) =>
      source.kind === "app" ? isDesktop : source.userId && source.apiKey,
    )
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "app" ? -1 : 1));
}

export const sourceName = (source: ZoteroSource): string =>
  source.kind === "app" ? "Zotero app" : source.label || "Zotero cloud";
