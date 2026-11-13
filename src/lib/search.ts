import { readPage } from "./page-file";
import { pageLabel } from "./project";

/** A piece of text with the part that matched. */
export interface Excerpt {
  before: string;
  match: string;
  after: string;
}

export interface SearchResult {
  path: string;
  title: string;
  /** Whether the title matched. */
  inTitle: boolean;
  /** How many times the page's text matches. */
  count: number;
  /** The first few places in the text, each on its line. */
  excerpts: Excerpt[];
}

/** A line of Markdown with its syntax taken out, as the page shows it. */
export function lineWords(line: string): string {
  return line
    .replace(/\[\[([^[\]|\n]+?)(?:\|([^[\]\n]*))?\]\]/g, (_w, target: string, label?: string) =>
      (label || target).trim(),
    )
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:>\s?)*(?:\[![a-z]+\])?\s*/i, "")
    .replace(/^\s*(?:#{1,6}|[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, "")
    .replace(/<\/?(?:details|summary)(?: open)?>/g, "")
    .replace(/\*\*|__|~~|==|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();

/** Where `needle` is in `text`, accents and case aside: [from, to) in `text`. */
function locate(text: string, needle: string): Array<[number, number]> {
  // Folding can change the length of the text: map each folded letter back.
  let folded = "";
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const piece = fold(text[i]);
    for (let j = 0; j < piece.length; j++) origin.push(i);
    folded += piece;
  }
  const found: Array<[number, number]> = [];
  for (let at = folded.indexOf(needle); at >= 0; at = folded.indexOf(needle, at + needle.length)) {
    found.push([origin[at], origin[at + needle.length - 1] + 1]);
  }
  return found;
}

function excerpt(line: string, [from, to]: [number, number]): Excerpt {
  const room = 48;
  const start = Math.max(0, from - room);
  const end = Math.min(line.length, to + room * 2);
  return {
    before: (start > 0 ? "…" : "") + line.slice(start, from).trimStart(),
    match: line.slice(from, to),
    after: line.slice(to, end).trimEnd() + (end < line.length ? "…" : ""),
  };
}

/**
 * The pages whose title or text holds `query`, case and accents aside.
 * Pages whose title matches come first, then the ones that match most.
 */
export function searchProject(
  pages: Record<string, string>,
  query: string,
  limit = 50,
): SearchResult[] {
  const needle = fold(query.trim().replace(/\s+/g, " "));
  if (!needle) return [];
  const results: SearchResult[] = [];
  for (const [path, source] of Object.entries(pages)) {
    const title = pageLabel(path, source);
    const inTitle = locate(title, needle).length > 0;
    const excerpts: Excerpt[] = [];
    let count = 0;
    let fence = false;
    for (const raw of readPage(source).markdown.split("\n")) {
      if (/^\s*(`{3,}|~{3,})/.test(raw)) {
        fence = !fence;
        continue;
      }
      // Code and the YAML of tutorial blocks are searched as they are written.
      // A table's rule row says nothing; its other rows read as their cells.
      if (!fence && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(raw)) continue;
      const cells = !fence && /^\s*\|/.test(raw)
        ? raw.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()).join(" · ")
        : raw;
      const line = fence ? raw.trim() : lineWords(cells);
      if (!line) continue;
      const found = locate(line, needle);
      count += found.length;
      if (found.length && excerpts.length < 3) excerpts.push(excerpt(line, found[0]));
    }
    if (inTitle || count) results.push({ path, title, inTitle, count, excerpts });
  }
  return results
    .sort(
      (a, b) =>
        Number(b.inTitle) - Number(a.inTitle) ||
        b.count - a.count ||
        a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }),
    )
    .slice(0, limit);
}
