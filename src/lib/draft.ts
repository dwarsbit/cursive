/**
 * The page as kept in this browser until projects are folders of
 * Markdown files: the title and the body as Markdown.
 */
export interface Draft {
  title: string;
  markdown: string;
}

const KEY = "cursive.draft.v1";

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Draft>;
    if (typeof value.title !== "string" || typeof value.markdown !== "string")
      return null;
    return { title: value.title, markdown: value.markdown };
  } catch {
    return null;
  }
}

/** Returns false when the browser refuses to store the page. */
export function saveDraft(draft: Draft): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** Words in a text, for the status bar. */
export function countWords(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}
