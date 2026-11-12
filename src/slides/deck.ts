import type { JSONContent } from "@tiptap/core";

/**
 * A presentation is a page whose front matter says `type: presentation`.
 * Its body is the slides, one after the other with a divider (`---`)
 * between them, so any Markdown tool reads it as one document.
 *
 * A slide's settings sit in a `slide` fence at its start, with YAML
 * inside, and its speaker notes in a `notes` fence. Other tools show
 * both as code; Cursive reads them.
 *
 *     ```slide
 *     layout: title
 *     text: small
 *     ```
 *
 *     # Pilot study results
 *
 *     ```notes
 *     Keep this to ten minutes.
 *     ```
 */
export type Layout = "content" | "title" | "big" | "quote";

export interface Slide {
  layout: Layout;
  /** Smaller text, for a slide that holds a lot. */
  small: boolean;
  /** The slide's blocks, as Markdown. */
  body: string;
  /** Speaker notes, plain text. */
  notes: string;
}

export const LAYOUTS: Array<{ id: Layout; label: string; hint: string }> = [
  { id: "title", label: "Title", hint: "A large title in the middle" },
  { id: "content", label: "Title and content", hint: "A heading with blocks under it" },
  { id: "big", label: "Big number", hint: "Heading 1 as one large figure" },
  { id: "quote", label: "Quote", hint: "A quote in the middle" },
];

const isLayout = (value: string): value is Layout =>
  LAYOUTS.some((layout) => layout.id === value);

export const emptySlide = (layout: Layout = "content"): Slide => ({
  layout,
  small: false,
  body: "",
  notes: "",
});

/** The `type` in a page's front matter, lowercase; "" when it has none. */
export function pageType(properties: string): string {
  const match = /^type:[ \t]*(.*)$/m.exec(properties);
  return (match?.[1] ?? "")
    .trim()
    .replace(/^(["'])(.*)\1$/, "$2")
    .toLowerCase();
}

export const isPresentation = (page: { properties: string }) =>
  pageType(page.properties) === "presentation";

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;
const DIVIDER = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

interface Block {
  /** The word after the fence's opening marks. */
  info: string;
  /** The lines between the fence's marks. */
  inner: string[];
  from: number;
  /** One past the closing line. */
  to: number;
}

/** The fenced blocks of some lines, outermost only. */
function fences(lines: string[]): Block[] {
  const found: Block[] = [];
  let open: { mark: string; info: string; from: number } | null = null;
  lines.forEach((line, index) => {
    const match = FENCE.exec(line);
    if (open) {
      const closes =
        match &&
        match[1][0] === open.mark[0] &&
        match[1].length >= open.mark.length &&
        line.trim() === match[1];
      if (closes) {
        found.push({
          info: open.info,
          inner: lines.slice(open.from + 1, index),
          from: open.from,
          to: index + 1,
        });
        open = null;
      }
    } else if (match) {
      open = { mark: match[1], info: match[2].toLowerCase(), from: index };
    }
  });
  // A fence left open runs to the end, as Markdown has it.
  if (open) {
    const { info, from } = open as { info: string; from: number };
    found.push({ info, inner: lines.slice(from + 1), from, to: lines.length });
  }
  return found;
}

const trimBlank = (lines: string[]) => {
  let from = 0;
  let to = lines.length;
  while (from < to && lines[from].trim() === "") from++;
  while (to > from && lines[to - 1].trim() === "") to--;
  return lines.slice(from, to);
};

function readSlide(source: string[]): Slide {
  let lines = trimBlank(source);
  const slide = emptySlide();
  const first = fences(lines)[0];
  if (first && first.from === 0 && first.info === "slide") {
    for (const line of first.inner) {
      const [, key, value = ""] = /^\s*([\w-]+):[ \t]*(.*?)\s*$/.exec(line) ?? [];
      const plain = value.replace(/^(["'])(.*)\1$/, "$2").toLowerCase();
      if (key === "layout" && isLayout(plain)) slide.layout = plain;
      if (key === "text") slide.small = plain === "small";
    }
    lines = lines.slice(first.to);
  }
  const notes: string[] = [];
  // The body's pieces around the notes, each without blank lines at its ends.
  const kept: string[] = [];
  let at = 0;
  for (const block of fences(lines)) {
    if (block.info !== "notes") continue;
    kept.push(trimBlank(lines.slice(at, block.from)).join("\n"));
    notes.push(block.inner.join("\n").trim());
    at = block.to;
  }
  kept.push(trimBlank(lines.slice(at)).join("\n"));
  slide.notes = notes.filter(Boolean).join("\n\n");
  slide.body = kept.filter(Boolean).join("\n\n");
  return slide;
}

/** A presentation's body as its slides. There is always at least one. */
export function readDeck(markdown: string): Slide[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const fenced = new Set<number>();
  for (const block of fences(lines)) {
    for (let line = block.from; line < block.to; line++) fenced.add(line);
  }
  const slides: Slide[] = [];
  let from = 0;
  lines.forEach((line, index) => {
    // A rule under a line of text is that line's underline, a heading.
    const divides =
      !fenced.has(index) &&
      DIVIDER.test(line) &&
      (index === 0 || lines[index - 1].trim() === "" || line.trim()[0] !== "-");
    if (!divides) return;
    slides.push(readSlide(lines.slice(from, index)));
    from = index + 1;
  });
  slides.push(readSlide(lines.slice(from)));
  return slides;
}

/** A fence around `text` that no line of the text can close. */
function fence(info: string, text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  const marks = "`".repeat(longest + 1);
  return `${marks}${info}\n${text}\n${marks}`;
}

function writeSlide(slide: Slide): string {
  const parts: string[] = [];
  const settings: string[] = [];
  if (slide.layout !== "content") settings.push(`layout: ${slide.layout}`);
  if (slide.small) settings.push("text: small");
  if (settings.length) parts.push(fence("slide", settings.join("\n")));
  const body = slide.body.trim();
  if (body) parts.push(body);
  const notes = slide.notes.trim();
  if (notes) parts.push(fence("notes", notes));
  return parts.join("\n\n");
}

/** The slides as a presentation's body. */
export function writeDeck(slides: Slide[]): string {
  return `${slides.map(writeSlide).join("\n\n---\n\n")}\n`;
}

/** What a slide is called in a list: its heading, or its first words. */
export function slideTitle(slide: Slide): string {
  const lines = slide.body.split("\n");
  const fenced = new Set<number>();
  for (const block of fences(lines)) {
    for (let line = block.from; line < block.to; line++) fenced.add(line);
  }
  const text = lines.filter((line, index) => !fenced.has(index) && line.trim() !== "");
  const heading = text.find((line) => /^ {0,3}#{1,6}\s/.test(line));
  return (heading ?? text[0] ?? "")
    .replace(/^\s*(?:>\s?)*(?:#{1,6}|[-*+]|\d+\.)?\s*(?:\[[ xX]\]\s+)?/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*+|~~|==|`+|\b_+|_+\b/g, "")
    .trim();
}

/** The file of a new presentation: one title slide. */
export const NEW_PRESENTATION = `---\ntype: presentation\n---\n\n${writeDeck([emptySlide("title")])}`;

// ---------- Splitting a slide that holds too much ----------

const LISTS = new Set(["bulletList", "orderedList", "taskList"]);
const size = (block: JSONContent) =>
  LISTS.has(block.type ?? "") ? Math.max(1, block.content?.length ?? 0) : 1;

/**
 * A slide's blocks as two slides' blocks, each about half. The heading
 * stays on the first and is repeated, with "(continued)", on the
 * second; a long list is cut between two of its items. Null when the
 * slide holds one thing that can't be cut.
 */
export function splitBlocks(
  blocks: JSONContent[],
): [JSONContent[], JSONContent[]] | null {
  const heading = blocks[0]?.type === "heading" ? blocks[0] : null;
  const rest = heading ? blocks.slice(1) : blocks;
  const total = rest.reduce((sum, block) => sum + size(block), 0);
  if (total < 2) return null;
  const half = Math.ceil(total / 2);
  const first: JSONContent[] = [];
  const second: JSONContent[] = [];
  let seen = 0;
  for (const block of rest) {
    const units = size(block);
    if (seen >= half) second.push(block);
    else if (seen + units <= half || !LISTS.has(block.type ?? "")) first.push(block);
    else {
      const cut = half - seen;
      const items = block.content ?? [];
      first.push({ ...block, content: items.slice(0, cut) });
      const start = Number(block.attrs?.start ?? 1) + cut;
      second.push({
        ...block,
        attrs: block.type === "orderedList" ? { ...block.attrs, start } : block.attrs,
        content: items.slice(cut),
      });
    }
    seen += units;
  }
  if (!first.length || !second.length) return null;
  if (!heading) return [first, second];
  const text = (heading.content ?? []).map((node) => node.text ?? "").join("");
  const again: JSONContent = text.endsWith("(continued)")
    ? heading
    : {
        ...heading,
        content: [...(heading.content ?? []), { type: "text", text: " (continued)" }],
      };
  return [
    [heading, ...first],
    [again, ...second],
  ];
}
