import { createContext, useContext, useEffect, useState } from "react";
import { linkIndex, resolveRelative, type LinkIndex } from "./links";
import { parentOf } from "./project";

/**
 * What a page's blocks need from the project around it: the other
 * pages, to link to and open, and the project's files, to show.
 */
export interface Workspace {
  /** The project's pages with their titles, by title. */
  pages: Array<{ path: string; title: string }>;
  index: LinkIndex;
  /** The open page's path. */
  active: string | null;
  openPage(path: string): void;
  /** Makes a page with this title next to the open page, and opens it. */
  createPage(title: string): void;
  /** The project's other files: images and attachments, by path. */
  files: Set<string>;
  /** Counts the times files changed: a file can change and keep its path. */
  filesVersion: number;
  /** An address the window can show a project file at; null when it can't be read. */
  fileUrl(path: string): Promise<string | null>;
  /** Opens a project file in the app it belongs to, or saves it. */
  openFile(path: string): void;
  /** Adds files to the project, next to the open page's. Gives their paths. */
  addFiles(files: File[]): Promise<string[]>;
  /** Whether files can be added here. */
  canAddFiles: boolean;
}

const empty: Workspace = {
  pages: [],
  index: linkIndex({}),
  active: null,
  openPage: () => {},
  createPage: () => {},
  files: new Set(),
  filesVersion: 0,
  fileUrl: async () => null,
  openFile: () => {},
  addFiles: async () => [],
  canAddFiles: false,
};

const WorkspaceContext = createContext<Workspace>(empty);
export const WorkspaceProvider = WorkspaceContext.Provider;
export const useWorkspace = () => useContext(WorkspaceContext);

/** The page whose blocks are drawn, where that isn't the open page: an export of other pages. */
const PagePathContext = createContext<string | null>(null);
export const PagePathProvider = PagePathContext.Provider;

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** A file address as the page writes it, as a path in the project. */
export function projectPathOf(src: string, page: string | null): string | null {
  if (!src || HAS_SCHEME.test(src) || src.startsWith("//")) return null;
  return resolveRelative(page ? parentOf(page) : "", src);
}

/**
 * Where the window finds an image or file the page names: a web
 * address as it is, a project file through the store. `undefined`
 * while it loads, null when there is nothing to show.
 */
export function useFileUrl(src: string): string | null | undefined {
  return useFile(src).url;
}

/** The file a page names, as `useFileUrl` finds it, with its path in the project. */
export function useFile(src: string): { path: string | null; url: string | null | undefined } {
  const { active, fileUrl, files, filesVersion } = useWorkspace();
  const page = useContext(PagePathContext) ?? active;
  const path = projectPathOf(src, page);
  const remote = !path && /^(?:https?:|data:image\/)/i.test(src) ? src : null;
  const known = path ? files.has(path) : false;
  const [found, setFound] = useState<{ key: string; url: string | null } | null>(null);
  const key = `${path}\n${known}\n${filesVersion}`;
  useEffect(() => {
    if (!path) return;
    let current = true;
    fileUrl(path).then(
      (url) => current && setFound({ key, url }),
      () => current && setFound({ key, url: null }),
    );
    return () => {
      current = false;
    };
  }, [path, key, fileUrl]);
  if (remote) return { path: null, url: remote };
  if (!path) return { path: null, url: null };
  return { path, url: found?.key === key ? found.url : undefined };
}
