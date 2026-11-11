export type Mode = "visual" | "markdown";

/** Small things this browser remembers; the app works without them. */
function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage is full or off.
  }
}

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const loadMode = (): Mode =>
  recall("cursive.mode") === "markdown" ? "markdown" : "visual";
export const saveMode = (mode: Mode) => remember("cursive.mode", mode);

export const loadOpenPage = () => recall("cursive.page");
export const saveOpenPage = (path: string) => remember("cursive.page", path);

/** The project folder the desktop app had open last. */
export const loadFolder = () => recall("cursive.folder");
export const saveFolder = (path: string) => remember("cursive.folder", path);

export function loadClosedFolders(): string[] {
  try {
    const value: unknown = JSON.parse(recall("cursive.closed") ?? "[]");
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}
export const saveClosedFolders = (paths: string[]) =>
  remember("cursive.closed", JSON.stringify(paths));

/** Words in a text, for the status bar. */
export function countWords(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}
