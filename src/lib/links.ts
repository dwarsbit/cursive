import { readPage, writePage } from "./page-file";
import { baseName, pageLabel, parentOf, type Project } from "./project";

/**
 * Links between pages. A page links to another as Obsidian and other
 * wiki tools write it, by the other page's title: `[[Pilot study]]`,
 * or `[[Pilot study|the pilot]]` to show other words. Where two pages
 * share a title, the link names the page by its path instead:
 * `[[Thesis/Pilot study]]`.
 *
 * Plain Markdown links to a page's file, `[the pilot](Pilot%20study.md)`,
 * count as links too, as GitHub and the published site read them.
 */

/** A `[[link]]` as it is written. */
export interface PageLinkText {
  raw: string;
  target: string;
  /** The words shown instead of the page's title; "" for none. */
  label: string;
}

const LINK = /^\[\[([^[\]|\n]+?)(?:\|([^[\]\n]*))?\]\]/;

/** The `[[link]]` at the start of `src`. */
export function matchPageLink(src: string): PageLinkText | null {
  const found = LINK.exec(src);
  if (!found) return null;
  const target = found[1].trim();
  if (!target) return null;
  return { raw: found[0], target, label: (found[2] ?? "").trim() };
}

/** A link as it is written in the file. */
export function writePageLink(target: string, label = ""): string {
  const clean = (text: string) =>
    text.replace(/[[\]|\n]+/g, " ").replace(/\s+/g, " ").trim();
  const shown = clean(label);
  return shown && shown !== clean(target)
    ? `[[${clean(target)}|${shown}]]`
    : `[[${clean(target)}]]`;
}

/** A name as links compare it: case, spaces and accents written either way match. */
export const normalName = (name: string) =>
  name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

const withoutMd = (path: string) => path.replace(/\.md$/i, "");

/** The names a link can use for a page: its title, its file's name and its path. */
function namesOf(path: string, source: string): string[] {
  return [
    normalName(readPage(source).title),
    normalName(withoutMd(baseName(path))),
    normalName(withoutMd(path)),
  ].filter(Boolean);
}

/** Every page by the names links can use for it. A title wins over a file name. */
export interface LinkIndex {
  resolve(target: string): string | null;
  /** How a link to the page at `path` is written. */
  targetFor(path: string): string;
}

export function linkIndex(pages: Record<string, string>): LinkIndex {
  const byTitle = new Map<string, string[]>();
  const byFile = new Map<string, string>();
  const byPath = new Map<string, string>();
  const paths = Object.keys(pages).sort();
  for (const path of paths) {
    const title = normalName(readPage(pages[path]).title);
    if (title) byTitle.set(title, [...(byTitle.get(title) ?? []), path]);
    const file = normalName(withoutMd(baseName(path)));
    if (!byFile.has(file)) byFile.set(file, path);
    byPath.set(normalName(withoutMd(path)), path);
  }
  return {
    resolve: (target) => {
      const name = normalName(target.replace(/#.*$/, ""));
      if (!name) return null;
      return byPath.get(name) ?? byTitle.get(name)?.[0] ?? byFile.get(name) ?? null;
    },
    targetFor: (path) => {
      const title = pages[path] === undefined ? "" : readPage(pages[path]).title.trim();
      const name = title || withoutMd(baseName(path));
      const shared =
        (byTitle.get(normalName(name))?.length ?? 0) > 1 ||
        (!title && byTitle.has(normalName(name)));
      return shared && path.includes("/") ? withoutMd(path) : name;
    },
  };
}

/** One link found in a page's body. */
export interface FoundLink {
  kind: "wiki" | "markdown";
  /** Where the link starts and ends in the body. */
  from: number;
  to: number;
  /** The page it names: a `[[target]]`, or a Markdown link's address. */
  target: string;
  label: string;
}

/**
 * The parts of a body outside code: fenced blocks and inline code
 * are skipped, as the editor reads them.
 */
function proseRanges(markdown: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let fence: string | null = null;
  let at = 0;
  for (const line of markdown.split("\n")) {
    const end = at + line.length;
    const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = null;
    } else if (mark) {
      fence = mark;
    } else {
      // Inline code keeps its text.
      const code = /(`+)[^`]*?\1/g;
      let from = at;
      for (let m = code.exec(line); m; m = code.exec(line)) {
        ranges.push([from, at + m.index]);
        from = at + m.index + m[0].length;
      }
      ranges.push([from, end]);
    }
    at = end + 1;
  }
  return ranges;
}

const MD_LINK = /(!?)\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\(\s*(<[^>\n]*>|[^)\s]+)(\s+"[^"\n]*")?\s*\)/g;

/** The links in a page's body: `[[links]]` and Markdown links, images left out. */
export function findLinks(markdown: string): FoundLink[] {
  const found: FoundLink[] = [];
  for (const [from, to] of proseRanges(markdown)) {
    const text = markdown.slice(from, to);
    for (let i = text.indexOf("[["); i >= 0; i = text.indexOf("[[", i + 1)) {
      const link = matchPageLink(text.slice(i));
      if (!link) continue;
      found.push({
        kind: "wiki",
        from: from + i,
        to: from + i + link.raw.length,
        target: link.target,
        label: link.label,
      });
      i += link.raw.length - 1;
    }
    MD_LINK.lastIndex = 0;
    for (let m = MD_LINK.exec(text); m; m = MD_LINK.exec(text)) {
      if (m[1]) continue;
      found.push({
        kind: "markdown",
        from: from + m.index,
        to: from + m.index + m[0].length,
        target: m[3].replace(/^<|>$/g, ""),
        label: m[2],
      });
    }
  }
  return found.sort((a, b) => a.from - b.from);
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * A relative address in a page at `fromDir`, as a path in the project.
 * Null for a web address, an anchor, or a path that leaves the project.
 */
export function resolveRelative(fromDir: string, href: string): string | null {
  if (!href || HAS_SCHEME.test(href) || href.startsWith("#") || href.startsWith("/"))
    return null;
  let path = href.replace(/[?#].*$/, "");
  try {
    path = decodeURIComponent(path);
  } catch {
    // Not encoded: read as it is written.
  }
  const parts = fromDir ? fromDir.split("/") : [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.length ? parts.join("/") : null;
}

/** The address of the project path `to` as a page at `fromDir` writes it. */
export function relativeHref(fromDir: string, to: string): string {
  const from = fromDir ? fromDir.split("/") : [];
  const target = to.split("/");
  let same = 0;
  while (same < from.length && same < target.length - 1 && from[same] === target[same])
    same++;
  const up = from.length - same;
  return [...Array<string>(up).fill(".."), ...target.slice(same)]
    .map((part) => (part === ".." ? part : encodeURIComponent(part)))
    .join("/");
}

/** The page a link leads to, or null when it leads nowhere in the project. */
export function linkedPage(
  link: FoundLink,
  from: string,
  index: LinkIndex,
  pages: Record<string, string>,
): string | null {
  if (link.kind === "wiki") return index.resolve(link.target);
  const path = resolveRelative(parentOf(from), link.target);
  if (!path) return null;
  const lower = path.toLowerCase();
  return (
    Object.keys(pages).find(
      (page) => page.toLowerCase() === lower || page.toLowerCase() === `${lower}.md`,
    ) ?? null
  );
}

/** A page that links to another, with the line the link is on. */
export interface Backlink {
  path: string;
  title: string;
  /** The text around the first link, without Markdown. */
  excerpt: string;
}

/** A line of Markdown as words, for an excerpt. */
function lineText(markdown: string, at: number): string {
  const start = markdown.lastIndexOf("\n", at - 1) + 1;
  const end = markdown.indexOf("\n", at);
  const line = markdown.slice(start, end < 0 ? undefined : end);
  return line
    .replace(/\[\[([^[\]|\n]+?)(?:\|([^[\]\n]*))?\]\]/g, (_w, target: string, label?: string) =>
      (label || target).trim(),
    )
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\^\[[^\]]*\]|\[@[^\]]*\]/g, "")
    .replace(/^\s*(?:>\s?)*(?:#{1,6}|[-*+]|\d+\.)?\s*(?:\[[ xX]\]\s+)?/, "")
    .replace(/\*+|~~|==|`+/g, "")
    .trim();
}

/** The pages that link to the page at `path`, in the order of their titles. */
export function backlinks(pages: Record<string, string>, path: string): Backlink[] {
  const index = linkIndex(pages);
  const found: Backlink[] = [];
  for (const [other, source] of Object.entries(pages)) {
    if (other === path) continue;
    const { markdown } = readPage(source);
    if (!markdown.includes("[")) continue;
    const link = findLinks(markdown).find(
      (link) => linkedPage(link, other, index, pages) === path,
    );
    if (!link) continue;
    const excerpt = lineText(markdown, link.from);
    found.push({
      path: other,
      title: pageLabel(other, source),
      excerpt: excerpt.length > 160 ? `${excerpt.slice(0, 157).trimEnd()}…` : excerpt,
    });
  }
  return found.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }),
  );
}

/**
 * The files to write after a page got another title or path: links in
 * other pages that named it the old way name it the new way. Links
 * that also fit another page are left alone.
 */
export function retargetLinks(
  before: Record<string, string>,
  after: Record<string, string>,
  from: string,
  to: string,
): Array<[path: string, source: string]> {
  const source = before[from];
  if (source === undefined || after[to] === undefined) return [];
  const old = new Set(namesOf(from, source));
  const oldIndex = linkIndex(before);
  const newIndex = linkIndex(after);
  const wanted = newIndex.targetFor(to);
  const writes: Array<[string, string]> = [];
  for (const [path, file] of Object.entries(after)) {
    if (path === to || !file.includes("[[")) continue;
    const page = readPage(file);
    let markdown = page.markdown;
    const links = findLinks(markdown).filter(
      (link) =>
        link.kind === "wiki" &&
        old.has(normalName(link.target)) &&
        oldIndex.resolve(link.target) === from &&
        newIndex.resolve(link.target) !== to,
    );
    if (!links.length) continue;
    for (const link of links.reverse()) {
      markdown =
        markdown.slice(0, link.from) +
        writePageLink(wanted, link.label) +
        markdown.slice(link.to);
    }
    writes.push([path, writePage({ ...page, markdown })]);
  }
  return writes;
}

/**
 * A page's body after the page moved from the folder `fromDir` to
 * `toDir`: its relative links and images point where they did before.
 */
export function rebaseLinks(markdown: string, fromDir: string, toDir: string): string {
  if (fromDir === toDir || !markdown.includes("](")) return markdown;
  let out = "";
  let last = 0;
  for (const [from, to] of proseRanges(markdown)) {
    const text = markdown.slice(from, to);
    MD_LINK.lastIndex = 0;
    for (let m = MD_LINK.exec(text); m; m = MD_LINK.exec(text)) {
      const href = m[3];
      const bare = href.replace(/^<|>$/g, "");
      const path = resolveRelative(fromDir, bare);
      if (!path) continue;
      const suffix = /[?#].*$/.exec(bare)?.[0] ?? "";
      const moved = relativeHref(toDir, path) + suffix;
      const at = from + m.index + m[0].lastIndexOf(href);
      out += markdown.slice(last, at) + (href.startsWith("<") ? `<${moved}>` : moved);
      last = at + href.length;
    }
  }
  return out + markdown.slice(last);
}

/** The pages of the project with their titles, for the link menu. */
export function linkablePages(project: Project): Array<{ path: string; title: string }> {
  return Object.entries(project.pages)
    .map(([path, source]) => ({ path, title: pageLabel(path, source) }))
    .sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }),
    );
}
