import { readPage } from "./page-file";

/**
 * A project: a folder of Markdown files. Paths use `/` and are
 * relative to the project folder; a page's path ends in `.md`.
 */
export interface Project {
  name: string;
  /** Every folder, also the empty ones. */
  folders: string[];
  /** Each page's file, by path. */
  pages: Record<string, string>;
  /** The project's other files, such as images and attachments, by path. */
  files?: string[];
}

/** The folder a project keeps its images and attached files in. */
export const ATTACHMENTS = "attachments";

export const isPagePath = (path: string) => path.toLowerCase().endsWith(".md");
export const parentOf = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
export const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
export const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** A page's name in the tree: its title, or its file name without `.md`. */
export function pageLabel(path: string, source: string): string {
  return (
    readPage(source).title.trim() || baseName(path).replace(/\.md$/i, "") || "Untitled"
  );
}

/** The property that keeps a page's place in its folder. */
export const ORDER_KEY = "order";
const ORDER_LINE = /^order:[ \t]*(-?\d+(?:\.\d+)?)[ \t]*$/m;

/** A page's place among its folder's pages, from its `order` property. */
export function pageOrder(source: string): number | undefined {
  const match = ORDER_LINE.exec(readPage(source).properties);
  return match ? Number(match[1]) : undefined;
}

