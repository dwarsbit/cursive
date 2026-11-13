import { inlineNumberedNotes } from "@/editor/footnote";
import { readPage } from "@/lib/page-file";
import { buildTree, pageLabel, type Project, type TreeNode } from "@/lib/project";
import { isPresentation, readDeck, type Slide } from "@/slides/deck";

/** What goes into the PDF: the open page, or every page of the project. */
export type Scope = "page" | "project";

export interface ExportOptions {
  scope: Scope;
  /** Speaker notes under each slide. */
  notes: boolean;
}

/** One page of the project as it goes into the PDF. */
export type Part =
  | { kind: "page"; path: string; title: string; markdown: string }
  | { kind: "slides"; path: string; title: string; slides: Slide[] };

/** A line of the contents list on the first sheet of a project. */
export interface ContentsLine {
  label: string;
  /** How deep in folders the line sits. */
  depth: number;
  folder: boolean;
}

export interface ExportJob {
  /** The PDF's suggested file name, without `.pdf`. */
  name: string;
  /**
   * `slides`: every sheet is one slide, at the slide's own size.
   * `paper`: pages of text on the paper the reader chooses, with slides
   * drawn as pictures on them.
   */
  format: "slides" | "paper";
  notes: boolean;
  parts: Part[];
  /** The contents list of a whole project; null for a single page. */
  contents: ContentsLine[] | null;
}

function part(path: string, source: string): Part {
  const page = readPage(source);
  const title = pageLabel(path, source);
  return isPresentation(page)
    ? {
        kind: "slides",
        path,
        title,
        slides: readDeck(inlineNumberedNotes(page.markdown)),
      }
    : { kind: "page", path, title, markdown: page.markdown };
}

/** The pages of a tree in the order the sidebar lists them. */
function walk(nodes: TreeNode[], depth: number, lines: ContentsLine[]): string[] {
  return nodes.flatMap((node) => {
    lines.push({ label: node.label, depth, folder: node.kind === "folder" });
    return node.kind === "page" ? [node.path] : walk(node.children, depth + 1, lines);
  });
}

/** Does the export hold a presentation? Then speaker notes are a choice. */
export function hasSlides(project: Project, active: string | null, scope: Scope) {
  const sources =
    scope === "project"
      ? Object.values(project.pages)
      : active && active in project.pages
        ? [project.pages[active]]
        : [];
  return sources.some((source) => isPresentation(readPage(source)));
}

/** What to print for an export, or null when there is nothing to print. */
export function buildJob(
  project: Project,
  active: string | null,
  options: ExportOptions,
): ExportJob | null {
  if (options.scope === "page") {
    if (!active || !(active in project.pages)) return null;
    const only = part(active, project.pages[active]);
    return {
      name: only.title,
      format: only.kind === "slides" && !options.notes ? "slides" : "paper",
      notes: options.notes,
      parts: [only],
      contents: null,
    };
  }
  const contents: ContentsLine[] = [];
  const paths = walk(buildTree(project), 0, contents);
  if (paths.length === 0) return null;
  return {
    name: project.name,
    format: "paper",
    notes: options.notes,
    parts: paths.map((path) => part(path, project.pages[path])),
    contents,
  };
}

/** The sheet's size and margins. A slide is 960 by 540 CSS pixels: 10 by 5.625 inches. */
export const pageRule = (format: ExportJob["format"]) =>
  format === "slides"
    ? "@page { size: 10in 5.625in; margin: 0; }"
    : "@page { margin: 18mm 17mm; }";
