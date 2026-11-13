/**
 * A page as a Markdown file: front matter with the page's properties,
 * then the body. The title is the one property the editor shows today;
 * the other lines of the front matter are kept as written.
 */
export interface Page {
  title: string;
  /** The front matter's other lines, as written in the file. */
  properties: string;
  /** The body, as Markdown. */
  markdown: string;
}

const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;
const TITLE_LINE = /^title:[ \t]*(.*)$/;

/** A title as a YAML value: plain when that is safe, quoted otherwise. */
function writeTitle(title: string): string {
  const plain =
    /^[\p{L}\p{N}]/u.test(title) &&
    !/: |:$| #|[\n\r\t"\\]/.test(title) &&
    title === title.trim() &&
    !/^(?:true|false|null|yes|no|on|off|~)$/i.test(title) &&
    !/^[\d.+-]+$/.test(title);
  return plain ? title : JSON.stringify(title);
}

function readTitle(value: string): string {
  const raw = value.trim();
  if (raw.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
    } catch {
      // Not JSON's kind of string: fall through to the text between the quotes.
    }
    return raw.replace(/^"|"$/g, "");
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length > 1) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  return raw;
}

/** Splits a file into its title, its other properties and its body. */
export function readPage(source: string): Page {
  const match = FRONT_MATTER.exec(source);
  if (!match)
    return { title: "", properties: "", markdown: source.replace(/^\n+/, "") };
  let title = "";
  let found = false;
  const rest: string[] = [];
  for (const line of match[1].split(/\r?\n/)) {
    const titleLine = found ? null : TITLE_LINE.exec(line);
    if (titleLine) {
      title = readTitle(titleLine[1]);
      found = true;
    } else {
      rest.push(line);
    }
  }
  return {
    title,
    properties: rest.join("\n").trim() ? rest.join("\n") : "",
    markdown: source.slice(match[0].length).replace(/^\n+/, ""),
  };
}

/** Writes a page as one file. A page with no properties has no front matter. */
export function writePage(page: Page): string {
  const lines: string[] = [];
  if (page.title) lines.push(`title: ${writeTitle(page.title)}`);
  if (page.properties) lines.push(page.properties);
  const body = page.markdown.replace(/^\n+/, "");
  if (!lines.length) return body;
  return `---\n${lines.join("\n")}\n---\n\n${body}`;
}

/**
 * The body of a file with the Markdown syntax taken out, for counting
 * words. Equations, citations and the reference list are not words.
 */
export function plainText(markdown: string): string {
  return markdown
    .replace(/^(`{3,})bibliography[ \t]*\n[\s\S]*?\n?\1[ \t]*$/gm, " ")
    .replace(/\[@[^\]\n]+\]/g, " ")
    .replace(/\^\[/g, " ")
    .replace(/^```.*$/gm, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]+\$/g, " ")
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, " ")
    .replace(/<\/?(?:details|summary)(?: open)?>/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(?:>\s?)*(?:\[![a-z]+\])?/gim, " ")
    .replace(/^\s*(?:#{1,6}|[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/gm, " ")
    .replace(/^\s*\|?(?:\s*:?-{3,}:?\s*\|?)+\s*$/gm, " ")
    .replace(/\|/g, " ")
    .replace(/\*+|~~|==|`+|\b_+|_+\b/g, "");
}

/**
 * Tidies Markdown written by the editor: one blank line between
 * blocks, none at the ends. Code blocks keep their lines as they are.
 */
export function tidyMarkdown(markdown: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split("\n")) {
    const mark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      out.push(line);
      if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = null;
      continue;
    }
    if (mark) fence = mark;
    const blank = line.trim() === "";
    if (blank && (out.length === 0 || out[out.length - 1].trim() === "")) continue;
    out.push(blank ? "" : line);
  }
  while (out.length && out[out.length - 1].trim() === "" && !fence) out.pop();
  return out.join("\n");
}
