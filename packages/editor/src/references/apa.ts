import { familyName, type CiteItem, type Reference } from "./reference";

/**
 * APA style (7th edition) for citations and the reference list. The
 * output is plain text in runs, some of them italic, so the editor,
 * the PDF export and the server all draw it their own way. The server
 * has a copy of this file (dwarsbit/polemic-server,
 * apps/api/src/sites/references.ts): change both.
 */
export interface Run {
  text: string;
  italic?: boolean;
}

/** "Ashish" is "A.", "Jean-Paul" is "J.-P.", "Donald E." is "D. E.". */
export function initials(given: string): string {
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      word
        .split("-")
        .map((part) => {
          const letter = [...part.replace(/[.,]/g, "")][0];
          return letter ? `${letter.toUpperCase()}.` : "";
        })
        .filter(Boolean)
        .join("-"),
    )
    .filter(Boolean)
    .join(" ");
}

/** "Vaswani, Ashish" as "Vaswani, A."; an organization as its name. */
function invertedName(name: string): string {
  const at = name.indexOf(",");
  if (at < 0) return name.trim();
  const given = initials(name.slice(at + 1));
  const family = name.slice(0, at).trim();
  return given ? `${family}, ${given}` : family;
}

/** "Vaswani, Ashish" as "A. Vaswani", for editors of a book. */
function directName(name: string): string {
  const at = name.indexOf(",");
  if (at < 0) return name.trim();
  const given = initials(name.slice(at + 1));
  const family = name.slice(0, at).trim();
  return given ? `${given} ${family}` : family;
}

/** The authors of a reference list entry: "A, B., B, C., & C, D.". */
export function authorList(names: string[]): string {
  const all = names.map(invertedName).filter(Boolean);
  if (all.length === 0) return "";
  if (all.length === 1) return all[0] ?? "";
  if (all.length > 20)
    return `${all.slice(0, 19).join(", ")}, . . . ${all[all.length - 1]}`;
  return `${all.slice(0, -1).join(", ")}, & ${all[all.length - 1]}`;
}

function editorList(names: string[]): string {
  const all = names.map(directName).filter(Boolean);
  if (all.length <= 1) return all[0] ?? "";
  if (all.length === 2) return `${all[0]} & ${all[1]}`;
  return `${all.slice(0, -1).join(", ")}, & ${all[all.length - 1]}`;
}

/** A sentence's last mark: a period, unless it ends in one already. */
const closed = (text: string) =>
  /[.?!]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

const year = (ref: Reference) => ref.year || "n.d.";

const link = (ref: Reference): string =>
  ref.doi
    ? `https://doi.org/${ref.doi.replace(/^(?:https?:\/\/)?(?:dx\.)?doi\.org\//i, "")}`
    : ref.url;

/** Titles that stand alone are italic; parts of something larger are not. */
const standsAlone = (ref: Reference) =>
  ["book", "report", "thesis", "webpage", "other"].includes(ref.type);

/** One entry of the reference list, as runs. */
export function referenceEntry(ref: Reference): Run[] {
  const runs: Run[] = [];
  const plain = (text: string) => {
    if (text) runs.push({ text });
  };
  const italic = (text: string) => {
    if (text) runs.push({ text, italic: true });
  };

  // Who: the authors, the editors of an edited book, or the title.
  let who = authorList(ref.author);
  const edited = !who && ref.type === "book" && ref.editor.length > 0;
  if (edited)
    who = `${authorList(ref.editor)} (${ref.editor.length > 1 ? "Eds." : "Ed."})`;
  const title = ref.title.trim();

  const titleRuns = () => {
    if (!title) return;
    if (standsAlone(ref)) {
      italic(title);
      if (ref.type === "thesis") {
        plain(
          ` [${[ref.genre || "Doctoral dissertation", ref.publisher].filter(Boolean).join(", ")}]`,
        );
        plain(".");
      } else if (ref.type === "report" && ref.genre) {
        plain(
          ` (${/^report/i.test(ref.genre) ? ref.genre : `Report No. ${ref.genre}`}).`,
        );
      } else {
        plain(/[.?!]$/.test(title) ? "" : ".");
      }
    } else {
      plain(closed(title));
    }
  };

  if (who) {
    plain(`${closed(who)} (${year(ref)}). `);
    titleRuns();
  } else {
    titleRuns();
    plain(` (${year(ref)}).`);
  }

  // Where: the journal, the book, the publisher.
  const source: Run[] = [];
  const add = (text: string, isItalic = false) => {
    if (text) source.push(isItalic ? { text, italic: true } : { text });
  };
  const pages = ref.pages.replace(/--?/g, "–");
  switch (ref.type) {
    case "article": {
      if (ref.container) {
        add(ref.container, true);
        if (ref.volume) {
          add(", ");
          add(ref.volume, true);
        }
        if (ref.issue) add(`(${ref.issue})`);
        if (pages) add(`, ${pages}`);
        add(".");
      }
      break;
    }
    case "chapter":
    case "conference": {
      if (ref.container) {
        const editors = editorList(ref.editor);
        add("In ");
        if (editors) add(`${editors} (${ref.editor.length > 1 ? "Eds." : "Ed."}), `);
        add(ref.container, true);
        if (pages) add(` (pp. ${pages})`);
        add(".");
      }
      if (ref.publisher) add(` ${closed(ref.publisher)}`);
      break;
    }
    case "thesis":
      break;
    case "webpage":
      if (ref.container && ref.container !== who) add(closed(ref.container));
      break;
    default:
      if (ref.publisher && ref.publisher !== who) add(closed(ref.publisher));
      else if (ref.container) add(closed(ref.container));
  }
  if (source.length) {
    plain(" ");
    runs.push(...source);
  }
  const address = link(ref);
  if (address) plain(` ${address}`);

  // Neighbouring runs in the same face become one.
  return runs.reduce<Run[]>((out, run) => {
    const last = out[out.length - 1];
    if (last && Boolean(last.italic) === Boolean(run.italic)) last.text += run.text;
    else out.push({ ...run });
    return out;
  }, []);
}

export const entryText = (ref: Reference): string =>
  referenceEntry(ref)
    .map((run) => run.text)
    .join("");

/** Who a citation names: "Vaswani", "Lee & Kim", "Vaswani et al.". */
function citedNames(ref: Reference): string {
  const people = ref.author.length ? ref.author : ref.editor;
  const families = people.map(familyName).filter(Boolean);
  if (families.length === 0) {
    const short = (ref.title.split(/[:.?!]/)[0] ?? "").trim();
    return standsAlone(ref) ? short : `“${short}”`;
  }
  if (families.length === 1) return families[0] ?? "";
  if (families.length === 2) return `${families[0]} & ${families[1]}`;
  return `${families[0]} et al.`;
}

/** The order of the reference list: by author, then year, then title. */
export function sortReferences(refs: Reference[]): Reference[] {
  const sortName = (ref: Reference) =>
    (ref.author.length ? authorList(ref.author) : ref.title)
      .replace(/^(?:the|a|an)\s+/i, "")
      .toLowerCase();
  return [...refs].sort(
    (a, b) =>
      sortName(a).localeCompare(sortName(b)) ||
      (a.year || "0").localeCompare(b.year || "0") ||
      a.title.localeCompare(b.title),
  );
}

/**
 * A citation in the text: "(Vaswani et al., 2017, p. 4; Lee, 2020)".
 * A key the page has no reference for shows as itself.
 */
export function citationText(items: CiteItem[], refs: Map<string, Reference>): string {
  const parts = items.map((item) => {
    const ref = refs.get(item.key);
    if (!ref) return item.locator ? `@${item.key}, ${item.locator}` : `@${item.key}`;
    const who = citedNames(ref);
    return [who, year(ref), item.locator].filter(Boolean).join(", ");
  });
  return `(${parts.join("; ")})`;
}
