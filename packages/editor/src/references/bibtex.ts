import {
  emptyReference,
  isKey,
  suggestKey,
  type Reference,
  type ReferenceType,
} from "./reference";

/**
 * BibTeX and BibLaTeX files, as reference managers export them: a
 * file of `@article{key, title = {…}, …}` entries. Citing a work from
 * one copies it into the page with the entry's own key, so a page
 * written for LaTeX or Pandoc keeps its citations.
 */

const TYPES: Record<string, ReferenceType> = {
  article: "article",
  book: "book",
  booklet: "book",
  mvbook: "book",
  collection: "book",
  inbook: "chapter",
  incollection: "chapter",
  inreference: "chapter",
  bookinbook: "chapter",
  inproceedings: "conference",
  conference: "conference",
  proceedings: "conference",
  phdthesis: "thesis",
  mastersthesis: "thesis",
  thesis: "thesis",
  techreport: "report",
  report: "report",
  online: "webpage",
  electronic: "webpage",
  www: "webpage",
};

const MONTHS: Record<string, string> = {
  jan: "January",
  feb: "February",
  mar: "March",
  apr: "April",
  may: "May",
  jun: "June",
  jul: "July",
  aug: "August",
  sep: "September",
  oct: "October",
  nov: "November",
  dec: "December",
};

/** Accent commands and the combining marks they stand for. */
const ACCENTS: Record<string, string> = {
  '"': "̈",
  "'": "́",
  "`": "̀",
  "^": "̂",
  "~": "̃",
  "=": "̄",
  ".": "̇",
  c: "̧",
  v: "̌",
  u: "̆",
  H: "̋",
  k: "̨",
  r: "̊",
};

const LETTERS: Record<string, string> = {
  ss: "ß",
  o: "ø",
  O: "Ø",
  ae: "æ",
  AE: "Æ",
  oe: "œ",
  OE: "Œ",
  aa: "å",
  AA: "Å",
  l: "ł",
  L: "Ł",
  i: "ı",
  j: "ȷ",
  dh: "ð",
  DH: "Ð",
  th: "þ",
  TH: "Þ",
  textendash: "–",
  textemdash: "—",
  textquoteleft: "‘",
  textquoteright: "’",
  textquotedblleft: "“",
  textquotedblright: "”",
  ldots: "…",
  dots: "…",
  textellipsis: "…",
  S: "§",
  P: "¶",
  TeX: "TeX",
  LaTeX: "LaTeX",
  BibTeX: "BibTeX",
};

/** LaTeX in a field as plain text: accents as letters, commands and braces gone. */
export function latexText(value: string): string {
  let text = value
    // {\"a}, \"{a}, \"a and \c{c}: an accent on one letter.
    .replace(
      /\{?\\([`'^"~=.])\s*\{?([A-Za-z]|\\[ij])\}?\}?/g,
      (_, mark: string, letter: string) =>
        (letter.replace(/\\([ij])/, "$1") + ACCENTS[mark]).normalize("NFC"),
    )
    .replace(
      /\{?\\([cvuHkr])\s*\{([A-Za-z])\}\}?/g,
      (_, mark: string, letter: string) => (letter + ACCENTS[mark]).normalize("NFC"),
    )
    .replace(/\{?\\([cvuHkr]) ([A-Za-z])\}?/g, (_, mark: string, letter: string) =>
      (letter + ACCENTS[mark]).normalize("NFC"),
    )
    .replace(
      /\{\\([A-Za-z]+)\}|\\([A-Za-z]+)(?![A-Za-z])\s?/g,
      (whole, inBraces?: string, bare?: string) => {
        const name = inBraces ?? bare ?? "";
        return name in LETTERS ? LETTERS[name] : whole;
      },
    )
    // \emph{x}, \textit{x} and other commands keep their argument.
    .replace(/\\[A-Za-z]+\*?\s*\{/g, "{")
    .replace(/\\([&%$#_{}])/g, "$1")
    .replace(/\\[A-Za-z]+\s*/g, "")
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/(?<!\\)~/g, " ")
    .replace(/``|''/g, (quote) => (quote === "``" ? "“" : "”"));
  text = text.replace(/[{}]/g, "");
  return text.replace(/\s+/g, " ").trim();
}

/** Splits at `sep` where the text isn't inside braces. */
function splitTop(text: string, sep: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (depth === 0) {
      sep.lastIndex = i;
      const found = sep.exec(text);
      if (found && found.index === i) {
        parts.push(text.slice(start, i));
        start = i + found[0].length;
        i = start - 1;
      }
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** Whether the whole text is one group in braces, as `{World Health Organization}`. */
function wholeBraced(text: string): boolean {
  if (!text.startsWith("{")) return false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i === text.length - 1;
  }
  return false;
}

/** One BibTeX name as "Family, Given"; a name in braces is an organization's and stays as it is. */
export function bibName(raw: string): string {
  const name = raw.trim();
  if (wholeBraced(name)) return latexText(name);
  const parts = splitTop(name, /,/y).map(latexText);
  // "Family, Jr, Given" and "Family, Given".
  if (parts.length >= 3) return `${parts[0]}, ${parts[2]}`;
  if (parts.length === 2) return `${parts[0]}, ${parts[1]}`;
  // "Given von Family": the family name starts at the first lowercase word, or is the last word.
  const words = splitTop(name, /\s+/y);
  if (words.length < 2) return latexText(name);
  let at = words.findIndex(
    (word, index) =>
      index > 0 && index < words.length - 1 && /^[a-z]/.test(latexText(word)),
  );
  if (at < 0) at = words.length - 1;
  const given = words.slice(0, at).map(latexText).join(" ");
  const family = words.slice(at).map(latexText).join(" ");
  return `${family}, ${given}`;
}

const bibNames = (value: string | undefined): string[] =>
  value
    ? splitTop(value, /\s+and\s+/iy)
        .filter((name) => name.toLowerCase() !== "others")
        .map(bibName)
    : [];

interface Entry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

/** Reads the entries of a BibTeX file; what it can't read is skipped. */
export function parseBibtex(source: string): Entry[] {
  const strings: Record<string, string> = { ...MONTHS };
  const entries: Entry[] = [];
  let i = 0;
  const n = source.length;
  const space = () => {
    while (i < n && /\s/.test(source[i])) i++;
  };
  /** A value in braces, from the opening brace, with its braces kept inside. */
  const braced = (): string => {
    let depth = 0;
    const start = i;
    for (; i < n; i++) {
      if (source[i] === "\\") {
        i++;
        continue;
      }
      if (source[i] === "{") depth++;
      else if (source[i] === "}" && --depth === 0) {
        i++;
        return source.slice(start + 1, i - 1);
      }
    }
    return source.slice(start + 1);
  };
  const quoted = (): string => {
    let depth = 0;
    const start = ++i;
    for (; i < n; i++) {
      const ch = source[i];
      if (ch === "\\") i++;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === '"' && depth === 0) break;
    }
    const value = source.slice(start, i);
    i++;
    return value;
  };
  /** A field's value: pieces joined by `#`. */
  const value = (): string => {
    let out = "";
    for (;;) {
      space();
      const ch = source[i];
      if (ch === "{") out += braced();
      else if (ch === '"') out += quoted();
      else {
        const word = /^[^\s,#}){]+/.exec(source.slice(i, i + 200))?.[0] ?? "";
        i += word.length;
        out += /^\d+$/.test(word) ? word : (strings[word.toLowerCase()] ?? word);
      }
      space();
      if (source[i] !== "#") return out;
      i++;
    }
  };

  while (i < n) {
    const at = source.indexOf("@", i);
    if (at < 0) break;
    i = at + 1;
    const type = /^[A-Za-z]+/.exec(source.slice(i, i + 40))?.[0]?.toLowerCase() ?? "";
    i += type.length;
    space();
    const open = source[i];
    if (!type || (open !== "{" && open !== "(")) continue;
    const close = open === "{" ? "}" : ")";
    i++;
    if (type === "comment" || type === "preamble") {
      i--;
      if (open === "{") braced();
      continue;
    }
    if (type === "string") {
      space();
      const name = /^[^\s=]+/.exec(source.slice(i))?.[0] ?? "";
      i += name.length;
      space();
      if (source[i] === "=") {
        i++;
        strings[name.toLowerCase()] = value();
      }
      while (i < n && source[i] !== close) i++;
      i++;
      continue;
    }
    space();
    const key = /^[^\s,]*/.exec(source.slice(i))?.[0] ?? "";
    i += key.length;
    const fields: Record<string, string> = {};
    for (;;) {
      space();
      if (source[i] === ",") i++;
      space();
      if (i >= n || source[i] === close) {
        i++;
        break;
      }
      const name = /^[^\s=,{}()]+/.exec(source.slice(i))?.[0] ?? "";
      if (!name) {
        // Not a field: give up on this entry where the next one starts.
        const next = source.indexOf("\n@", i);
        i = next < 0 ? n : next + 1;
        break;
      }
      i += name.length;
      space();
      if (source[i] !== "=") continue;
      i++;
      fields[name.toLowerCase()] = value();
    }
    entries.push({ type, key, fields });
  }
  return entries;
}

/** An entry as a reference. Its key stays when it can name a citation, else a new one is made. */
export function bibReference(entry: Entry, taken: Iterable<string> = []): Reference {
  const f = (name: string) => latexText(entry.fields[name] ?? "");
  const ref = emptyReference("");
  ref.type =
    TYPES[entry.type] ?? (entry.type === "misc" && f("url") ? "webpage" : "other");
  ref.author = bibNames(entry.fields.author);
  ref.editor = bibNames(entry.fields.editor);
  ref.title = f("title");
  ref.year = /\d{4}/.exec(f("year") || f("date"))?.[0] ?? "";
  ref.container =
    f("journal") ||
    f("journaltitle") ||
    f("booktitle") ||
    f("eventtitle") ||
    (ref.type === "webpage" ? f("organization") : "");
  ref.publisher =
    f("publisher") || f("school") || f("institution") || f("organization");
  ref.place = f("address") || f("location");
  ref.volume = f("volume");
  ref.issue = ref.type === "report" ? f("issue") : f("number") || f("issue");
  ref.pages = f("pages").replace(/\s*[–—-]+\s*/g, "-");
  ref.doi = f("doi").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  ref.url = f("url");
  ref.genre =
    entry.type === "phdthesis"
      ? "Doctoral dissertation"
      : entry.type === "mastersthesis"
        ? "Master's thesis"
        : ref.type === "report"
          ? f("number")
          : f("type");
  const key = entry.key.trim();
  ref.key = isKey(key) && !new Set(taken).has(key) ? key : suggestKey(ref, taken);
  return ref;
}

/** The works of a BibTeX file, each once by key. */
export function bibtexReferences(source: string): Reference[] {
  const seen = new Set<string>();
  const refs: Reference[] = [];
  for (const entry of parseBibtex(source)) {
    // A second entry with a key the file has already is left out.
    if (isKey(entry.key.trim()) && seen.has(entry.key.trim())) continue;
    if (!TYPES[entry.type] && !entry.fields.title) continue;
    const ref = bibReference(entry, seen);
    seen.add(ref.key);
    refs.push(ref);
  }
  return refs;
}
