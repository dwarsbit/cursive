import type { Page } from "./page-file";

/**
 * The page as kept in this browser until projects are folders of
 * Markdown files.
 */
const KEY = "cursive.draft.v1";

export function loadDraft(): Page | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Page>;
    if (typeof value.title !== "string" || typeof value.markdown !== "string")
      return null;
    return {
      title: value.title,
      properties: typeof value.properties === "string" ? value.properties : "",
      markdown: value.markdown,
    };
  } catch {
    return null;
  }
}

/** Returns false when the browser refuses to store the page. */
export function saveDraft(page: Page): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(page));
    return true;
  } catch {
    return false;
  }
}

export type Mode = "visual" | "markdown";
const MODE_KEY = "cursive.mode";

export function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "markdown" ? "markdown" : "visual";
  } catch {
    return "visual";
  }
}

export function saveMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // The mode is a convenience; the page works without it.
  }
}

/** Words in a text, for the status bar. */
export function countWords(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}
