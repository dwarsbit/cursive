import * as apa from "./apa";
import { familyName, type CiteItem, type Reference } from "./reference";
import type { Run } from "./apa";

/**
 * Citation styles. APA is in apa.ts; the others are here: Chicago
 * (author-date), MLA, IEEE, Harvard (Cite Them Right) and Vancouver.
 * Each gives a reference list entry as runs, some of them italic, and a
 * citation as text. A page names its style in its front matter, as
 * Pandoc does, by the name of the style's CSL file: `csl: ieee`.
 *
 * The server has a copy of this file (dwarsbit/polemic-server,
 * apps/api/src/sites/styles.ts): change both.
 */
export type StyleId =
  | "apa"
  | "chicago-author-date"
  | "modern-language-association"
  | "ieee"
  | "harvard-cite-them-right"
  | "vancouver";

export interface CitationStyle {
  id: StyleId;
  /** Its name in the menu. */
  label: string;
  /** Numbered styles cite "[1]" and list the works in the order they are first cited. */
  numeric: boolean;
  entry(ref: Reference): Run[];
  /** A citation in the text. `numbers` gives each cited key its number, in a numbered style. */
  citation(items: CiteItem[], refs: Map<string, Reference>, numbers: Map<string, number>): string;
}

// ---------- Names ----------

interface Name {
  family: string;
  given: string;
  /** An organization: its name, as it is written. */
  literal: boolean;
}

function parseName(name: string): Name {
  const at = name.indexOf(",");
  if (at < 0) return { family: name.trim(), given: "", literal: true };
  return { family: name.slice(0, at).trim(), given: name.slice(at + 1).trim(), literal: false };
}

/** "Jean-Paul Erik" as "J.-P. E." (with `dots`) or "JPE" (without, as Vancouver writes them). */
function initialsOf(given: string, dots = true): string {
  if (dots) return apa.initials(given);
  return given
    .split(/[\s-]+/)
    .map((part) => [...part.replace(/[.,]/g, "")][0]?.toUpperCase() ?? "")
    .join("");
}

/** "A", "A and B", "A, B, and C" (`serial`) or "A, B and C". */
function joinNames(names: string[], and: string, serial: boolean): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}${serial ? "," : ""} ${and} ${names[names.length - 1]}`;
}

/** The family names a citation shows: "Vaswani", "Lee and Kim", "Vaswani et al.". */
function citedFamilies(ref: Reference, and: string, serial: boolean, upTo: number): string {
  const people = ref.author.length ? ref.author : ref.editor;
  const families = people.map(familyName).filter(Boolean);
  if (families.length === 0) {
    const short = (ref.title.split(/[:.?!]/)[0] ?? "").trim();
    return standsAlone(ref) ? short : `“${short}”`;
  }
  if (families.length > upTo) return `${families[0]} et al.`;
  return joinNames(families, and, serial);
}

// ---------- Pieces ----------

const standsAlone = (ref: Reference) =>
  ["book", "report", "thesis", "webpage", "other"].includes(ref.type);

/** A text with a full stop, unless it ends in a mark already. */
const stop = (text: string) => (/[.?!]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

const pagesOf = (ref: Reference) => ref.pages.replace(/--?/g, "–");

const doiOf = (ref: Reference) =>
  ref.doi.replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, "").trim();

const doiLink = (ref: Reference) => (doiOf(ref) ? `https://doi.org/${doiOf(ref)}` : "");

/** Builds an entry run by run; neighbouring runs in the same face become one. */
class Entry {
  runs: Run[] = [];
  text(text: string): this {
    if (text) this.runs.push({ text });
    return this;
  }
  italic(text: string): this {
    if (text) this.runs.push({ text, italic: true });
    return this;
  }
  done(): Run[] {
    return this.runs.reduce<Run[]>((out, run) => {
      const last = out[out.length - 1];
      if (last && Boolean(last.italic) === Boolean(run.italic)) last.text += run.text;
      else out.push({ ...run });
      return out;
    }, []);
  }
}

/** What a locator says without "p." or "pp.": MLA and Chicago write the page alone. */
const barePages = (locator: string) => locator.replace(/^(?:pp?\.|pages?)\s*/i, "");

const citationOf = (
  items: CiteItem[],
  refs: Map<string, Reference>,
  part: (ref: Reference, item: CiteItem) => string,
) =>
  items.map((item) => {
    const ref = refs.get(item.key);
    if (!ref) return item.locator ? `@${item.key}, ${item.locator}` : `@${item.key}`;
    return part(ref, item);
  });

/** "[1]", "[1], [3]", "[2, p. 4]": a numbered citation. */
function numbered(
  items: CiteItem[],
  numbers: Map<string, number>,
  open: string,
  close: string,
  together: boolean,
): string {
  const parts = items.map((item) => {
    const n = numbers.get(item.key);
    const label = n === undefined ? `@${item.key}` : String(n);
    return item.locator ? `${label}, ${item.locator}` : label;
  });
  // Pages make the commas ambiguous: "(1, p. 4; 2)".
  const between = items.some((item) => item.locator) ? "; " : ", ";
  return together
    ? `${open}${parts.join(between)}${close}`
    : parts.map((part) => `${open}${part}${close}`).join(", ");
}

// ---------- Chicago, author-date (17th edition) ----------

function chicagoNames(names: string[]): string {
  const parsed = names.map(parseName);
  const shown = parsed.length > 10 ? parsed.slice(0, 7) : parsed;
  const written = shown.map((name, index) =>
    name.literal || !name.given
      ? name.family
      : index === 0
        ? `${name.family}, ${name.given}`
        : `${name.given} ${name.family}`,
  );
  if (parsed.length > 10) return `${written.join(", ")}, et al.`;
  // The first name is turned around, so a comma follows it: "Lee, Kim, and Ji-woo Park".
  if (written.length === 2) return `${written[0]}${parsed[0]!.literal ? "" : ","} and ${written[1]}`;
  return joinNames(written, "and", true);
}

const directNames = (names: string[]) =>
  names.map(parseName).map((name) => (name.literal || !name.given ? name.family : `${name.given} ${name.family}`));

const chicago: CitationStyle = {
  id: "chicago-author-date",
  label: "Chicago (author-date)",
  numeric: false,
  entry(ref) {
    const out = new Entry();
    const editors = ref.editor.length > 1 ? "eds." : "ed.";
    let who = chicagoNames(ref.author);
    if (!who && ref.editor.length) who = `${chicagoNames(ref.editor)}, ${editors}`;
    const year = ref.year || "n.d.";
    const title = ref.title.trim();
    const titled = () => {
      if (!title) return;
      if (standsAlone(ref) && ref.type !== "thesis") out.italic(title).text(/[.?!]$/.test(title) ? " " : ". ");
      else out.text(`“${stop(title)}” `);
    };
    if (who) {
      out.text(`${stop(who)} ${stop(year)} `);
      titled();
    } else {
      titled();
      out.text(`${stop(year)} `);
    }
    const pages = pagesOf(ref);
    const publisher = [ref.place, ref.publisher].filter(Boolean).join(": ");
    switch (ref.type) {
      case "article":
        if (ref.container) {
          out.italic(ref.container);
          if (ref.volume) out.text(` ${ref.volume}`);
          if (ref.issue) out.text(` (${ref.issue})`);
          out.text(pages ? `: ${pages}. ` : ". ");
        }
        break;
      case "chapter":
      case "conference":
        if (ref.container) {
          out.text("In ").italic(ref.container);
          if (ref.editor.length && ref.author.length)
            out.text(`, edited by ${joinNames(directNames(ref.editor), "and", true)}`);
          out.text(pages ? `, ${pages}. ` : ". ");
        }
        if (publisher) out.text(`${stop(publisher)} `);
        break;
      case "thesis":
        out.text(`${stop([ref.genre || "PhD diss.", ref.publisher].filter(Boolean).join(", "))} `);
        break;
      case "report":
        if (ref.genre) out.text(`${stop(/^report/i.test(ref.genre) ? ref.genre : `Report ${ref.genre}`)} `);
        if (publisher) out.text(`${stop(publisher)} `);
        break;
      case "webpage":
        if (ref.container && ref.container !== who) out.text(`${stop(ref.container)} `);
        break;
      default:
        if (publisher && ref.publisher !== who) out.text(`${stop(publisher)} `);
        else if (ref.container) out.text(`${stop(ref.container)} `);
    }
    const link = doiLink(ref) || ref.url;
    if (link) out.text(`${link}.`);
    return trimEnd(out.done());
  },
  citation(items, refs) {
    const parts = citationOf(items, refs, (ref, item) => {
      const head = `${citedFamilies(ref, "and", true, 3)} ${ref.year || "n.d."}`;
      return item.locator ? `${head}, ${barePages(item.locator)}` : head;
    });
    return `(${parts.join("; ")})`;
  },
};

// ---------- MLA (9th edition) ----------

function mlaNames(names: string[]): string {
  const parsed = names.map(parseName);
  const first = parsed[0];
  if (!first) return "";
  const head = first.literal || !first.given ? first.family : `${first.family}, ${first.given}`;
  if (parsed.length === 1) return head;
  if (parsed.length === 2) {
    const second = parsed[1]!;
    return `${head}, and ${second.literal || !second.given ? second.family : `${second.given} ${second.family}`}`;
  }
  return `${head}, et al`;
}

const withoutScheme = (url: string) => url.replace(/^https?:\/\//i, "");

const mla: CitationStyle = {
  id: "modern-language-association",
  label: "MLA",
  numeric: false,
  entry(ref) {
    const out = new Entry();
    let who = mlaNames(ref.author);
    if (!who && ref.type === "book" && ref.editor.length)
      who = `${mlaNames(ref.editor)}, ${ref.editor.length > 1 ? "editors" : "editor"}`;
    if (who) out.text(`${stop(who)} `);
    const title = ref.title.trim();
    if (title) {
      if (standsAlone(ref) && ref.type !== "webpage") out.italic(title).text(/[.?!]$/.test(title) ? " " : ". ");
      else out.text(`“${stop(title)}” `);
    }
    // The container, then what places the work in it, in MLA's order, between commas.
    const parts: Run[][] = [];
    const part = (...runs: Run[]) => {
      const kept = runs.filter((run) => run.text);
      if (kept.length) parts.push(kept);
    };
    const pages = pagesOf(ref);
    if (ref.container && ref.type !== "thesis" && ref.container !== who) part({ text: ref.container, italic: true });
    if (ref.editor.length && ref.author.length && ["chapter", "conference"].includes(ref.type))
      part({ text: `edited by ${joinNames(directNames(ref.editor), "and", false)}` });
    if (ref.volume) part({ text: `vol. ${ref.volume}` });
    if (ref.issue) part({ text: `no. ${ref.issue}` });
    if (ref.publisher && ref.type !== "article" && ref.type !== "thesis" && ref.publisher !== who)
      part({ text: ref.publisher });
    if (ref.type === "thesis") {
      // A thesis: its year stands alone, then where and what it is.
      if (ref.year) out.text(`${ref.year}. `);
      part({ text: ref.publisher });
      part({ text: ref.genre || "PhD dissertation" });
    } else part({ text: ref.year });
    if (pages) part({ text: `${/[–,-]/.test(pages) ? "pp." : "p."} ${pages}` });
    const link = doiLink(ref) || withoutScheme(ref.url);
    if (link) part({ text: link });
    parts.forEach((runs, index) => {
      if (index > 0) out.text(", ");
      for (const run of runs) (run.italic ? out.italic(run.text) : out.text(run.text));
    });
    if (parts.length) out.text(".");
    return trimEnd(out.done());
  },
  citation(items, refs) {
    const parts = citationOf(items, refs, (ref, item) => {
      const who = citedFamilies(ref, "and", false, 2);
      return item.locator ? `${who} ${barePages(item.locator)}` : who;
    });
    return `(${parts.join("; ")})`;
  },
};

// ---------- IEEE ----------

function ieeeNames(names: string[]): string {
  const written = names.map(parseName).map((name) =>
    name.literal || !name.given ? name.family : `${initialsOf(name.given)} ${name.family}`,
  );
  if (written.length > 6) return `${written[0]} et al.`;
  return joinNames(written, "and", true);
}

const ieee: CitationStyle = {
  id: "ieee",
  label: "IEEE",
  numeric: true,
  entry(ref) {
    const out = new Entry();
    const who = ieeeNames(ref.author) || (ref.editor.length ? `${ieeeNames(ref.editor)}, ${ref.editor.length > 1 ? "Eds." : "Ed."}` : "");
    if (who) out.text(`${who}, `);
    const title = ref.title.trim();
    const pages = pagesOf(ref);
    const publisher = [ref.place, ref.publisher].filter(Boolean).join(": ");
    const tail: string[] = [];
    switch (ref.type) {
      case "article":
        out.text(`“${title},” `);
        if (ref.container) out.italic(ref.container);
        if (ref.volume) tail.push(`vol. ${ref.volume}`);
        if (ref.issue) tail.push(`no. ${ref.issue}`);
        if (pages) tail.push(`${/[–,-]/.test(pages) ? "pp." : "p."} ${pages}`);
        if (ref.year) tail.push(ref.year);
        break;
      case "chapter":
      case "conference":
        out.text(`“${title},” in `);
        if (ref.container) out.italic(ref.container);
        if (ref.editor.length && ref.author.length) tail.push(`${ieeeNames(ref.editor)}, ${ref.editor.length > 1 ? "Eds." : "Ed."}`);
        if (publisher) tail.push(publisher);
        if (ref.year) tail.push(ref.year);
        if (pages) tail.push(`${/[–,-]/.test(pages) ? "pp." : "p."} ${pages}`);
        break;
      case "thesis":
        out.text(`“${title},” ${ref.genre || "Ph.D. dissertation"}`);
        if (ref.publisher) tail.push(ref.publisher);
        if (ref.place) tail.push(ref.place);
        if (ref.year) tail.push(ref.year);
        break;
      case "report":
        out.text(`“${title},” `).text(ref.publisher || "");
        if (ref.place) tail.push(ref.place);
        if (ref.genre) tail.push(/^rep/i.test(ref.genre) ? ref.genre : `Rep. ${ref.genre}`);
        if (ref.year) tail.push(ref.year);
        break;
      case "webpage":
        out.text(`“${title},” `).text(ref.container || "");
        if (ref.year) tail.push(ref.year);
        break;
      default:
        out.italic(title);
        if (publisher) out.text(`. ${publisher}`);
        if (ref.year) tail.push(ref.year);
    }
    for (const piece of tail) out.text(`, ${piece}`);
    out.text(".");
    if (doiOf(ref)) out.text(` doi: ${doiOf(ref)}.`);
    else if (ref.url) out.text(` [Online]. Available: ${ref.url}`);
    return trimEnd(fixCommas(out.done()));
  },
  citation: (items, _refs, numbers) => numbered(items, numbers, "[", "]", false),
};

// ---------- Harvard (Cite Them Right, 12th edition) ----------

function harvardNames(names: string[]): string {
  const written = names.map(parseName).map((name) =>
    name.literal || !name.given ? name.family : `${name.family}, ${initialsOf(name.given).replace(/\. /g, ".")}`,
  );
  return joinNames(written, "and", false);
}

const harvard: CitationStyle = {
  id: "harvard-cite-them-right",
  label: "Harvard",
  numeric: false,
  entry(ref) {
    const out = new Entry();
    let who = harvardNames(ref.author);
    if (!who && ref.editor.length) who = `${harvardNames(ref.editor)} (${ref.editor.length > 1 ? "eds." : "ed."})`;
    const year = ref.year ? `(${ref.year})` : "(no date)";
    const title = ref.title.trim();
    const pages = pagesOf(ref);
    const publisher = [ref.place, ref.publisher].filter(Boolean).join(": ");
    out.text(who ? `${who} ${year} ` : "");
    switch (ref.type) {
      case "article":
        out.text(`‘${title}’`);
        if (!who) out.text(` ${year}`);
        if (ref.container) out.text(", ").italic(ref.container);
        if (ref.volume) out.text(`, ${ref.volume}`);
        if (ref.issue) out.text(`(${ref.issue})`);
        if (pages) out.text(`, ${/[–,-]/.test(pages) ? "pp." : "p."} ${pages}`);
        out.text(".");
        break;
      case "chapter":
      case "conference":
        out.text(`‘${title}’`);
        if (!who) out.text(` ${year}`);
        if (ref.container) {
          out.text(", in ");
          if (ref.editor.length && ref.author.length) out.text(`${harvardNames(ref.editor)} (${ref.editor.length > 1 ? "eds." : "ed."}) `);
          out.italic(ref.container);
        }
        if (publisher) out.text(`. ${publisher}`);
        if (pages) out.text(`, ${/[–,-]/.test(pages) ? "pp." : "p."} ${pages}`);
        out.text(".");
        break;
      default: {
        out.italic(title);
        if (!who) out.text(` ${year}`);
        out.text(".");
        if (ref.type === "thesis") out.text(` ${stop(ref.genre || "PhD thesis")}${ref.publisher ? ` ${stop(ref.publisher)}` : ""}`);
        else if (ref.type === "report" && ref.genre) out.text(` ${stop(ref.genre)}`);
        if (ref.type === "webpage") {
          if (ref.container && ref.container !== who) out.text(` ${stop(ref.container)}`);
        } else if (ref.type !== "thesis" && publisher) out.text(` ${stop(publisher)}`);
      }
    }
    const link = doiLink(ref) || ref.url;
    if (link) out.text(` Available at: ${link}.`);
    return trimEnd(out.done());
  },
  citation(items, refs) {
    const parts = citationOf(items, refs, (ref, item) =>
      [citedFamilies(ref, "and", false, 3), ref.year || "no date", item.locator].filter(Boolean).join(", "),
    );
    return `(${parts.join("; ")})`;
  },
};

// ---------- Vancouver (NLM) ----------

function vancouverNames(names: string[]): string {
  const written = names.map(parseName).map((name) =>
    name.literal || !name.given ? name.family : `${name.family} ${initialsOf(name.given, false)}`,
  );
  if (written.length > 6) return `${written.slice(0, 6).join(", ")}, et al`;
  return written.join(", ");
}

const vancouver: CitationStyle = {
  id: "vancouver",
  label: "Vancouver",
  numeric: true,
  entry(ref) {
    const out = new Entry();
    const authors = vancouverNames(ref.author);
    const editors = ref.editor.length ? `${vancouverNames(ref.editor)}, ${ref.editor.length > 1 ? "editors" : "editor"}` : "";
    const who = authors || editors;
    if (who) out.text(`${stop(who)} `);
    const title = ref.title.trim();
    const pages = pagesOf(ref);
    const publisher = [ref.place, ref.publisher].filter(Boolean).join(": ");
    switch (ref.type) {
      case "article":
        out.text(`${stop(title)} `);
        if (ref.container) out.text(`${stop(ref.container)} `);
        out.text(ref.year);
        if (ref.volume) out.text(`;${ref.volume}`);
        if (ref.issue) out.text(`(${ref.issue})`);
        if (pages) out.text(`:${pages}`);
        out.text(".");
        break;
      case "chapter":
      case "conference":
        out.text(`${stop(title)} In: `);
        if (authors && editors) out.text(`${editors}. `);
        if (ref.container) out.text(`${stop(ref.container)} `);
        out.text([publisher, ref.year].filter(Boolean).join("; "));
        if (pages) out.text(`. p. ${pages}`);
        out.text(".");
        break;
      case "thesis":
        out.text(`${title} [${(ref.genre || "dissertation").toLowerCase()}]. `);
        out.text(`${[[ref.place, ref.publisher].filter(Boolean).join(": "), ref.year].filter(Boolean).join("; ")}.`);
        break;
      case "webpage":
        out.text(`${title} [Internet]. `);
        out.text(`${[ref.container, ref.year].filter(Boolean).join("; ")}.`);
        break;
      default:
        out.text(`${stop(title)} `);
        out.text(`${[publisher, ref.year].filter(Boolean).join("; ")}.`);
        if (ref.type === "report" && ref.genre) out.text(` Report No.: ${ref.genre}.`);
    }
    if (doiOf(ref)) out.text(` doi:${doiOf(ref)}`);
    else if (ref.url) out.text(` Available from: ${ref.url}`);
    return trimEnd(fixCommas(out.done()));
  },
  citation: (items, _refs, numbers) => numbered(items, numbers, "(", ")", true),
};

// ---------- APA ----------

const apaStyle: CitationStyle = {
  id: "apa",
  label: "APA",
  numeric: false,
  entry: apa.referenceEntry,
  citation: (items, refs) => apa.citationText(items, refs),
};

// ---------- The list ----------

export const STYLES: CitationStyle[] = [apaStyle, chicago, harvard, ieee, mla, vancouver];

/** The style a page names in its front matter, `csl: ieee`; APA when it names none or one Cursive lacks. */
export function styleById(id: string | undefined | null): CitationStyle {
  const name = (id ?? "")
    .trim()
    .replace(/^.*[/\\]/, "")
    .replace(/\.csl$/i, "")
    .toLowerCase();
  const alias: Record<string, StyleId> = {
    chicago: "chicago-author-date",
    mla: "modern-language-association",
    harvard: "harvard-cite-them-right",
  };
  return STYLES.find((style) => style.id === (alias[name] ?? name)) ?? apaStyle;
}

/** The front matter key that names a page's style. */
export const STYLE_KEY = "csl";

/** The style the front matter of a page names: its `csl` line. */
export function styleOfProperties(properties: string): CitationStyle {
  const match = /^csl:[ \t]*["']?([^"'\n]*?)["']?[ \t]*$/m.exec(properties);
  return styleById(match?.[1]);
}

/**
 * Each cited work's number, in the order the page first cites it; the
 * works it keeps but doesn't cite come after.
 */
export function numberWorks(cited: Iterable<string>, refs: Reference[]): Map<string, number> {
  const numbers = new Map<string, number>();
  const known = new Set(refs.map((ref) => ref.key));
  for (const key of cited) if (known.has(key) && !numbers.has(key)) numbers.set(key, numbers.size + 1);
  for (const ref of sortForList(refs)) if (!numbers.has(ref.key)) numbers.set(ref.key, numbers.size + 1);
  return numbers;
}

const sortForList = (refs: Reference[]) => apa.sortReferences(refs);

/** The reference list in the style's order: by number, or by author, year and title. */
export function listOrder(style: CitationStyle, refs: Reference[], numbers: Map<string, number>): Reference[] {
  if (!style.numeric) return sortForList(refs);
  return [...refs].sort((a, b) => (numbers.get(a.key) ?? 1e9) - (numbers.get(b.key) ?? 1e9));
}

/** An entry as plain text. */
export const entryPlain = (style: CitationStyle, ref: Reference): string =>
  style
    .entry(ref)
    .map((run) => run.text)
    .join("");

/** Takes ", ," and ",." that empty parts leave behind out of an entry. */
function fixCommas(runs: Run[]): Run[] {
  return runs.map((run) => ({ ...run, text: run.text.replace(/,\s*,/g, ",").replace(/,\s*\./g, ".").replace(/“,” /g, "") }));
}

function trimEnd(runs: Run[]): Run[] {
  const last = runs[runs.length - 1];
  if (last) last.text = last.text.replace(/\s+$/, "");
  return runs.filter((run) => run.text);
}
