/**
 * Find and replace in the open page. The find bar works on whichever
 * editor shows the page: the blocks of Visual mode, or the file in
 * Markdown mode. Each one offers itself as a `FindTarget`.
 */

export interface FindQuery {
  text: string;
  caseSensitive: boolean;
}

export interface FindState {
  /** How many places match. */
  count: number;
  /** Which of them is current, from 0; -1 when none is. */
  current: number;
}

export interface FindTarget {
  /** Marks every place that matches, and makes the first one after the caret current. */
  find(query: FindQuery): FindState;
  /** Makes the next or the previous match current, or with 0 the current one, and shows it. */
  move(step: 1 | 0 | -1): FindState;
  /** Replaces the current match, and makes the next one current. */
  replace(text: string): FindState;
  /** Replaces every match. Gives how many were replaced. */
  replaceAll(text: string): number;
  /** Takes the marks away. */
  clear(): void;
}

let target: FindTarget | null = null;
const listeners = new Set<() => void>();

/** Offers an editor to the find bar. Gives the function that takes it back. */
export function offerFindTarget(next: FindTarget): () => void {
  target = next;
  listeners.forEach((listener) => listener());
  return () => {
    if (target !== next) return;
    next.clear();
    target = null;
    listeners.forEach((listener) => listener());
  };
}

export const findTarget = () => target;
export function onFindTarget(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The places in `text` that match, as [from, to) ranges. */
export function matchesIn(text: string, query: FindQuery): Array<[number, number]> {
  if (!query.text) return [];
  const haystack = query.caseSensitive ? text : text.toLocaleLowerCase();
  const needle = query.caseSensitive ? query.text : query.text.toLocaleLowerCase();
  // Lowercasing can change a string's length; then the ranges would be off.
  if (haystack.length !== text.length || needle.length !== query.text.length) {
    return matchesIn(text, { ...query, caseSensitive: true });
  }
  const found: Array<[number, number]> = [];
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) {
    found.push([at, at + needle.length]);
  }
  return found;
}

/** Asks the page to show the find bar, with this text in it. */
export const openFind = (text?: string, replace = false) =>
  window.dispatchEvent(new CustomEvent("cursive:find", { detail: { text, replace } }));
