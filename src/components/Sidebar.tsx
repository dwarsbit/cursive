import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
  Presentation,
  Trash2,
  Search,
} from "lucide-react";
import { createContext, useContext, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { dragWindow } from "@/lib/platform";
import { scrollNearEdge, startPointerDrag } from "@/lib/pointer-drag";
import { countPages, parentOf, type TreeNode } from "@/lib/project";
import { ContextMenu, type MenuAt, type MenuEntry } from "./ContextMenu";
import { messageOf } from "./Dialog";
import { Mark } from "./Mark";

/** Where a dragged row lands: before or after a row, or into a folder. */
export type DropPlace = "before" | "after" | "into";

/** What is being dragged in the tree, and where it would land now. */
interface TreeDrag {
  /** A page's path, or a slide's presentation path and index. */
  from: { kind: "page"; path: string } | { kind: "slide"; path: string; index: number };
  over: { row: string; place: DropPlace } | null;
}

/** The tree's shared state: the drag under way, and how rows start one or open their menu. */
const TreeContext = createContext<{
  drag: TreeDrag | null;
  press: (event: React.PointerEvent, from: TreeDrag["from"]) => void;
  openMenu: (event: React.MouseEvent, entries: MenuEntry[]) => void;
}>({ drag: null, press: () => {}, openMenu: () => {} });

/** A row's key for drops: the page or folder path, or `path#index` for a slide. */
const rowKey = (path: string, index?: number) =>
  index === undefined ? path : `${path}#${index}`;

const dropClass = (drag: TreeDrag | null, key: string) =>
  drag?.over?.row === key ? `row-drop-${drag.over.place}` : undefined;

export interface SidebarProps {
  projectName: string;
  tree: TreeNode[];
  /** The open page's path. */
  active: string | null;
  /** Folders shown closed. */
  closed: ReadonlySet<string>;
  /** A folder or page whose name is being typed. */
  renaming: string | null;
  onOpen: (path: string) => void;
  onToggle: (path: string) => void;
  /** Adds a note in a folder ("" for the top). */
  onNewPage: (folder: string) => void;
  /** The presentations by path: what each of their slides is called. */
  decks?: ReadonlyMap<string, string[]>;
  /** The slide being worked on, in the open presentation. */
  slide?: number;
  onOpenSlide?: (path: string, index: number) => void;
  /** These three change the open presentation. */
  onNewSlide?: () => void;
  onDeleteSlide?: (index: number) => void;
  onMoveSlide?: (from: number, to: number) => void;
  onNewPresentation?: (folder: string) => void;
  onNewFolder: () => void;
  /** Moves a page next to another page, or into a folder. */
  onMovePage?: (path: string, target: string, place: DropPlace) => void;
  /** The sidebar's width, in pixels; dragging its edge changes it. */
  width?: number;
  onResize?: (width: number) => void;
  onRename: (path: string | null) => void;
  /** Takes the name typed for a folder, or the title typed for a page. */
  onRenamed: (node: TreeNode, name: string) => void;
  onDelete: (node: TreeNode) => void;
  /** Gives the project another name; only where the app can. Rejects with why not. */
  onRenameProject?: (name: string) => Promise<void>;
  /** Opens another project; only where the app can. */
  onSwitchProject?: () => void;
  switchLabel?: string;
  /** Opens the search across the project's pages. */
  onSearch?: () => void;
}

function RowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="row-action grid size-5 flex-none place-items-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
    >
      {children}
    </button>
  );
}

function NameField({
  node,
  onDone,
}: {
  node: TreeNode;
  onDone: (name: string | null) => void;
}) {
  const [name, setName] = useState(node.label);
  return (
    <input
      autoFocus
      value={name}
      aria-label={node.kind === "folder" ? "Folder name" : "Page title"}
      onFocus={(event) => event.target.select()}
      onChange={(event) => setName(event.target.value)}
      onBlur={() => onDone(name)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") onDone(name);
        if (event.key === "Escape") onDone(null);
      }}
      className="h-5 min-w-0 flex-1 rounded border border-ring bg-background px-1 text-xs outline-none"
    />
  );
}

/** What a right-click on a folder or page offers. */
function rowMenu(node: TreeNode, props: SidebarProps): MenuEntry[] {
  const folder = node.kind === "folder" ? node.path : parentOf(node.path);
  return [
    { label: "Add note", onSelect: () => props.onNewPage(folder) },
    ...(props.onNewPresentation
      ? [
          {
            label: "Add presentation",
            onSelect: () => props.onNewPresentation?.(folder),
          },
        ]
      : []),
    "separator",
    { label: "Rename", onSelect: () => props.onRename(node.path) },
    { label: "Delete", destructive: true, onSelect: () => props.onDelete(node) },
  ];
}

function Rows({
  nodes,
  depth,
  ...props
}: SidebarProps & { nodes: TreeNode[]; depth: number }) {
  const tree = useContext(TreeContext);
  return (
    <ul
      role={depth === 0 ? "tree" : "group"}
      aria-label={depth === 0 ? "Contents" : undefined}
    >
      {nodes.map((node) => {
        // A presentation opens and closes like a folder, over its slides.
        const slides = node.kind === "page" ? props.decks?.get(node.path) : undefined;
        const open = (node.kind === "folder" || slides) && !props.closed.has(node.path);
        const current = node.path === props.active;
        const pad = { paddingLeft: 4 + depth * 16 };
        const PageIcon = slides ? Presentation : FileText;
        const caret = (
          <button
            type="button"
            aria-label={open ? `Close ${node.label}` : `Open ${node.label}`}
            className="caret grid size-5 flex-none place-items-center rounded text-muted-foreground hover:bg-foreground/10"
            onClick={(event) => {
              event.stopPropagation();
              props.onToggle(node.path);
            }}
          >
            <ChevronRight
              className={cn("size-3.5 transition-transform", open && "rotate-90")}
              aria-hidden
            />
          </button>
        );
        const nameField = (
          <NameField
            node={node}
            onDone={(name) => {
              props.onRename(null);
              if (name !== null) props.onRenamed(node, name);
            }}
          />
        );
        return (
          <li
            key={node.path}
            role="treeitem"
            aria-expanded={node.kind === "folder" || slides ? Boolean(open) : undefined}
            aria-selected={current}
          >
            {node.kind === "folder" ? (
              <div
                className={cn("row group", dropClass(tree.drag, node.path))}
                style={pad}
                data-row="folder"
                data-key={node.path}
                onClick={() => props.onToggle(node.path)}
                onDoubleClick={() => props.onRename(node.path)}
                onContextMenu={(event) => tree.openMenu(event, rowMenu(node, props))}
              >
                {caret}
                <Folder
                  className="size-3.5 flex-none text-muted-foreground"
                  aria-hidden
                />
                {props.renaming === node.path ? (
                  nameField
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate">{node.label}</span>
                    <RowButton
                      label={`Add note in ${node.label}`}
                      onClick={() => props.onNewPage(node.path)}
                    >
                      <Plus className="size-3.5" aria-hidden />
                    </RowButton>
                    <RowButton
                      label={`Delete ${node.label}`}
                      onClick={() => props.onDelete(node)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </RowButton>
                    <span className="row-count text-2xs text-muted-foreground tabular-nums">
                      {countPages(node)}
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div
                // An open presentation shows where you are on its slide's row.
                className={cn(
                  "row group",
                  current && (slides && open ? "font-medium" : "row-active"),
                  tree.drag?.from.kind === "page" &&
                    tree.drag.from.path === node.path &&
                    "opacity-40",
                  dropClass(tree.drag, node.path),
                )}
                style={pad}
                data-row="page"
                data-key={node.path}
                onPointerDown={(event) =>
                  props.renaming !== node.path &&
                  tree.press(event, { kind: "page", path: node.path })
                }
                onDoubleClick={() => props.onRename(node.path)}
                onContextMenu={(event) => tree.openMenu(event, rowMenu(node, props))}
              >
                {slides ? caret : <span className="size-5 flex-none" />}
                <PageIcon
                  className={cn(
                    "size-3.5 flex-none",
                    current ? "text-tint" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                {props.renaming === node.path ? (
                  nameField
                ) : (
                  <>
                    <button
                      type="button"
                      aria-current={current ? "page" : undefined}
                      onClick={() => props.onOpen(node.path)}
                      className="row-main min-w-0 flex-1 truncate text-left"
                    >
                      {node.label}
                    </button>
                    {slides && current && props.onNewSlide && (
                      <RowButton label="Add slide" onClick={props.onNewSlide}>
                        <Plus className="size-3.5" aria-hidden />
                      </RowButton>
                    )}
                    <RowButton
                      label={`Delete ${node.label}`}
                      onClick={() => props.onDelete(node)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </RowButton>
                    {slides && (
                      <span className="row-count text-2xs text-muted-foreground tabular-nums">
                        {slides.length}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
            {open && node.children.length > 0 && (
              <Rows {...props} nodes={node.children} depth={depth + 1} />
            )}
            {open && slides && (
              <Slides
                path={node.path}
                titles={slides}
                depth={depth + 1}
                props={props}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A presentation's slides, as rows under it. The open presentation's can be dragged and deleted. */
function Slides({
  path,
  titles,
  depth,
  props,
}: {
  path: string;
  titles: string[];
  depth: number;
  props: SidebarProps;
}) {
  const tree = useContext(TreeContext);
  const open = path === props.active;
  return (
    <ul role="group">
      {titles.map((title, index) => {
        const current = open && index === props.slide;
        const key = rowKey(path, index);
        const dragged =
          tree.drag?.from.kind === "slide" &&
          tree.drag.from.path === path &&
          tree.drag.from.index === index;
        return (
          <li
            key={index}
            role="treeitem"
            aria-selected={current}
            data-row="slide"
            data-key={key}
            className={cn(
              "row group",
              current && "row-active",
              dragged && "opacity-40",
              dropClass(tree.drag, key),
            )}
            style={{ paddingLeft: 4 + depth * 16 }}
            onPointerDown={(event) =>
              open &&
              titles.length > 1 &&
              tree.press(event, { kind: "slide", path, index })
            }
            onContextMenu={(event) =>
              tree.openMenu(
                event,
                open
                  ? [
                      ...(props.onNewSlide
                        ? [{ label: "Add slide", onSelect: props.onNewSlide }]
                        : []),
                      "separator" as const,
                      {
                        label: "Delete",
                        destructive: true,
                        onSelect: () => props.onDeleteSlide?.(index),
                      },
                    ]
                  : [],
              )
            }
          >
            <span className="w-5 flex-none text-center text-2xs text-muted-foreground tabular-nums">
              {index + 1}
            </span>
            <button
              type="button"
              aria-current={current ? "true" : undefined}
              aria-label={`Slide ${index + 1}: ${title || "Empty slide"}`}
              onClick={() => props.onOpenSlide?.(path, index)}
              className={cn(
                "row-main min-w-0 flex-1 truncate text-left",
                !title && "text-muted-foreground",
              )}
            >
              {title || "Empty slide"}
            </button>
            {open && (
              <RowButton
                label={`Delete slide ${index + 1}`}
                onClick={() => props.onDeleteSlide?.(index)}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </RowButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The project's name. Where the app can rename the project, a click turns it into a field. */
function ProjectName({
  name,
  onRename,
}: {
  name: string;
  onRename?: (name: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const busy = useRef(false);

  if (!onRename) return <span className="min-w-0 flex-1 truncate px-1">{name}</span>;
  // The name, and the field that renames it, take the room up to the buttons.

  const close = () => {
    setDraft(null);
    setProblem(null);
  };
  const commit = async () => {
    const wanted = draft?.trim();
    if (busy.current) return;
    if (!wanted || wanted === name) return close();
    busy.current = true;
    try {
      await onRename(wanted);
      close();
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      busy.current = false;
    }
  };

  if (draft === null) {
    return (
      <span className="flex min-w-0 flex-1">
        <button
          type="button"
          title="Rename project"
          onClick={() => setDraft(name)}
          className="h-7 min-w-0 truncate rounded-md px-1 text-left hover:bg-accent"
        >
          {name}
        </button>
      </span>
    );
  }
  return (
    <span className="relative min-w-0 flex-1">
      <input
        autoFocus
        value={draft}
        aria-label="Project name"
        aria-invalid={problem !== null}
        maxLength={120}
        onFocus={(event) => event.target.select()}
        onChange={(event) => {
          setDraft(event.target.value);
          setProblem(null);
        }}
        // Leaving the field renames; with a problem on show, it gives up.
        onBlur={() => (problem ? close() : void commit())}
        onKeyDown={(event) => {
          if (event.key === "Enter") void commit();
          if (event.key === "Escape") close();
        }}
        className="h-7 w-full rounded-md border border-ring bg-background px-1 text-sm font-semibold outline-none"
      />
      {problem && (
        <span
          role="alert"
          className="popover absolute top-full left-0 z-20 mt-1 w-56 px-2 py-1.5 text-xs font-normal text-destructive"
        >
          {problem}
        </span>
      )}
    </span>
  );
}

/** Which row the pointer is over, and where on it a dragged row would land. */
function dropAt(from: TreeDrag["from"], x: number, y: number): TreeDrag["over"] {
  const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-row]");
  const key = row?.dataset.key;
  if (!row || !key) return null;
  const kind = row.dataset.row;
  const box = row.getBoundingClientRect();
  const half = y < box.top + box.height / 2 ? "before" : "after";
  if (from.kind === "slide") {
    if (kind !== "slide" || !key.startsWith(`${from.path}#`)) return null;
    return key === rowKey(from.path, from.index) ? null : { row: key, place: half };
  }
  if (kind === "folder") return { row: key, place: "into" };
  if (kind !== "page" || key === from.path) return null;
  return { row: key, place: half };
}

/** The sidebar's edge, which a drag makes wider or narrower. */
function Resizer({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}) {
  return (
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Sidebar width"
      aria-valuenow={width}
      title="Drag to resize"
      onDoubleClick={() => onResize(SIDEBAR_WIDTH)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const start = event.clientX;
        startPointerDrag(event, {
          threshold: 0,
          cursor: "col-resize",
          onMove: (move) => onResize(clampWidth(width + move.clientX - start)),
          onDrop: () => {},
        });
      }}
    />
  );
}

export const SIDEBAR_WIDTH = 248;
export const clampWidth = (width: number) =>
  Math.round(Math.min(480, Math.max(180, width)));

/** The project's notes, presentations and folders as a tree, with the buttons to add to it. */
export function Sidebar(props: SidebarProps) {
  const [drag, setDrag] = useState<TreeDrag | null>(null);
  const [menu, setMenu] = useState<MenuAt | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const press = (event: React.PointerEvent, from: TreeDrag["from"]) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    if ((event.target as HTMLElement).closest("input, .row-action, .caret")) return;
    let over: TreeDrag["over"] = null;
    startPointerDrag(event, {
      onStart: () => setDrag({ from, over: null }),
      onMove: (move) => {
        scrollNearEdge(list.current, move.clientY);
        over = dropAt(from, move.clientX, move.clientY);
        setDrag({ from, over });
      },
      onDrop: () => {
        if (!over) return;
        if (from.kind === "page") {
          props.onMovePage?.(from.path, over.row, over.place);
        } else {
          const index = Number(over.row.slice(over.row.lastIndexOf("#") + 1));
          let to = over.place === "after" ? index + 1 : index;
          if (from.index < to) to -= 1;
          if (to !== from.index) props.onMoveSlide?.(from.index, to);
        }
      },
      onEnd: () => setDrag(null),
    });
  };

  const openMenu = (event: React.MouseEvent, entries: MenuEntry[]) => {
    event.preventDefault();
    event.stopPropagation();
    if (entries.length) setMenu({ x: event.clientX, y: event.clientY, entries });
  };

  const add = (folder: string): MenuEntry[] => [
    { label: "Add note", onSelect: () => props.onNewPage(folder) },
    ...(props.onNewPresentation
      ? [
          {
            label: "Add presentation",
            onSelect: () => props.onNewPresentation?.(folder),
          },
        ]
      : []),
    { label: "Add folder", onSelect: props.onNewFolder },
  ];

  return (
    <aside className="sidebar" aria-label="Project">
      <div
        className="sidebar-head flex h-11 flex-none items-center gap-1 px-2 text-sm font-semibold"
        onPointerDown={dragWindow}
      >
        <Mark className="mark mr-1 size-[22px] flex-none" />
        <ProjectName name={props.projectName} onRename={props.onRenameProject} />
        {props.onSwitchProject && (
          <button
            type="button"
            aria-label={props.switchLabel}
            title={props.switchLabel}
            onClick={props.onSwitchProject}
            className="grid size-6 flex-none place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <FolderOpen className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      <div className="flex h-6 items-center justify-end gap-0.5 px-2 pt-1 pb-1 text-xs font-medium text-muted-foreground">
        {props.onSearch && (
          <button
            type="button"
            title="Search the project (Cmd/Ctrl + Shift + F)"
            onClick={props.onSearch}
            className="mr-auto inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 hover:bg-accent hover:text-foreground"
          >
            <Search className="size-3.5" aria-hidden />
            Search
          </button>
        )}
        <button
          type="button"
          aria-label="Add folder"
          title="Add folder"
          onClick={props.onNewFolder}
          className="grid size-6 place-items-center rounded-md hover:bg-accent hover:text-foreground"
        >
          <FolderPlus className="size-3.5" aria-hidden />
        </button>
        {props.onNewPresentation && (
          <button
            type="button"
            aria-label="Add presentation"
            title="Add presentation"
            onClick={() => props.onNewPresentation?.("")}
            className="grid size-6 place-items-center rounded-md hover:bg-accent hover:text-foreground"
          >
            <Presentation className="size-3.5" aria-hidden />
          </button>
        )}
        <button
          type="button"
          aria-label="Add note"
          title="Add note"
          onClick={() => props.onNewPage("")}
          className="grid size-6 place-items-center rounded-md hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>

      <div
        ref={list}
        className="min-h-0 flex-1 overflow-y-auto pb-2"
        onContextMenu={(event) => openMenu(event, add(""))}
      >
        <TreeContext.Provider value={{ drag, press, openMenu }}>
          {props.tree.length === 0 ? (
            <p className="px-2 py-1 text-xs text-muted-foreground">Nothing here yet.</p>
          ) : (
            <Rows {...props} nodes={props.tree} depth={0} />
          )}
        </TreeContext.Provider>
      </div>
      {props.onResize && (
        <Resizer width={props.width ?? SIDEBAR_WIDTH} onResize={props.onResize} />
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}
