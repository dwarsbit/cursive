import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { FilePlus, FileText } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  insertPageLink,
  type LinkMenuController,
  type LinkMenuState,
} from "../editor/page-link";
import { normalName, type Backlink } from "../lib/links";
import { useWorkspace } from "../lib/workspace";
import { cn } from "../lib/cn";

/**
 * A link to another page in the text, with that page's title. A click
 * opens the page; a link to a page that doesn't exist makes it.
 */
export function PageLinkView({ node, selected }: ReactNodeViewProps) {
  const { index, pages, openPage, createPage } = useWorkspace();
  const target = node.attrs.target as string;
  const label = node.attrs.label as string;
  const path = index.resolve(target);
  const title = path ? pages.find((page) => page.path === path)?.title : undefined;
  return (
    <NodeViewWrapper
      as="span"
      className={cn("page-link", !path && "page-link-missing", selected && "is-selected")}
      title={path ? `Open “${title ?? target}”` : `Add page “${target}”`}
      onClick={(event: React.MouseEvent) => {
        event.preventDefault();
        if (path) openPage(path);
        else createPage(target);
      }}
    >
      <FileText className="page-link-icon" aria-hidden />
      {label || title || target}
    </NodeViewWrapper>
  );
}

type Option = { kind: "page"; path: string; title: string } | { kind: "new"; title: string };

/** How well a title fits what was typed: lower is better; null is no fit. */
function rank(title: string, query: string): number | null {
  const t = normalName(title);
  const q = normalName(query);
  if (!q) return 2;
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.split(/[\s/.-]+/).some((word) => word.startsWith(q))) return 2;
  return t.includes(q) ? 3 : null;
}

/** The pages to link to under a typed `[[`, and a new page with the typed title. */
export function LinkMenu({
  state,
  controller,
}: {
  state: LinkMenuState;
  controller: LinkMenuController;
}) {
  const { editor, query, range, rect } = state;
  const { pages, active, index: links } = useWorkspace();
  const [selected, setSelected] = useState(0);
  const [lastQuery, setLastQuery] = useState(query);
  const menuRef = useRef<HTMLDivElement>(null);

  if (query !== lastQuery) {
    setLastQuery(query);
    setSelected(0);
  }

  const options = useMemo(() => {
    const found = pages
      .filter((page) => page.path !== active)
      .map((page) => ({ page, rank: rank(page.title, query) }))
      .filter((item): item is { page: (typeof pages)[number]; rank: number } =>
        item.rank !== null,
      )
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 8)
      .map(({ page }): Option => ({ kind: "page", ...page }));
    const title = query.trim();
    if (title && !pages.some((page) => normalName(page.title) === normalName(title))) {
      found.push({ kind: "new", title });
    }
    return found;
  }, [pages, active, query]);
  const index = Math.min(selected, Math.max(0, options.length - 1));

  const pick = (option: Option) => {
    controller.close();
    if (option.kind === "page") {
      insertPageLink(editor, range, links.targetFor(option.path));
      return;
    }
    // The page is made when the link is followed, so typing here goes on.
    insertPageLink(editor, range, option.title);
  };

  useEffect(() =>
    controller.handleKeys((event) => {
      if (!options.length) return false;
      if (event.key === "ArrowDown") {
        setSelected((index + 1) % options.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((index + options.length - 1) % options.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        pick(options[index]);
        return true;
      }
      return false;
    }),
  );

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    void computePosition(
      { getBoundingClientRect: () => rect() ?? new DOMRect() },
      menu,
      {
        placement: "bottom-start",
        strategy: "fixed",
        middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
      },
    ).then(({ x, y }) => {
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.style.visibility = "visible";
    });
  }, [rect, options.length]);

  useEffect(() => {
    menuRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index, query]);

  return (
    <div
      ref={menuRef}
      role="listbox"
      aria-label="Link to a page"
      className="popover fixed z-30 flex max-h-[min(22rem,60vh)] w-[300px] flex-col text-[13px]"
      style={{ visibility: "hidden" }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {options.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            Type the title of a page.
          </p>
        )}
        {options.map((option, at) => {
          const Icon = option.kind === "page" ? FileText : FilePlus;
          const folder =
            option.kind === "page" && option.path.includes("/")
              ? option.path.slice(0, option.path.lastIndexOf("/"))
              : "";
          return (
            <button
              key={option.kind === "page" ? option.path : `new:${option.title}`}
              type="button"
              role="option"
              aria-selected={at === index}
              className={cn(
                "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left",
                at === index && "bg-accent",
              )}
              onMouseEnter={() => setSelected(at)}
              onClick={() => pick(option)}
            >
              <Icon className="size-3.5 flex-none text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {option.kind === "page" ? option.title : `Add page “${option.title}”`}
              </span>
              {folder && (
                <span className="max-w-[40%] flex-none truncate text-2xs text-muted-foreground">
                  {folder}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="flex flex-none justify-between border-t px-3 py-1.5 text-2xs text-muted-foreground">
        <span>↑↓ to choose, ↵ to link</span>
        <span>Esc to close</span>
      </div>
    </div>
  );
}

/** The pages that link to the open page, under its blocks. */
export function Backlinks({ links }: { links: Backlink[] }) {
  const { openPage } = useWorkspace();
  if (!links.length) return null;
  return (
    <section className="backlinks" aria-label="Linked from">
      <h2>
        Linked from {links.length === 1 ? "1 page" : `${links.length} pages`}
      </h2>
      <ul>
        {links.map((link) => (
          <li key={link.path}>
            <button type="button" onClick={() => openPage(link.path)}>
              <span className="backlink-title">
                <FileText aria-hidden />
                {link.title}
              </span>
              {link.excerpt && <span className="backlink-excerpt">{link.excerpt}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
