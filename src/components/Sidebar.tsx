import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
  Presentation,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { dragWindow } from "@/lib/platform";
import { countPages, type TreeNode } from "@/lib/project";
import { messageOf } from "./Dialog";
import { Mark } from "./Mark";

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
  onNewPresentation?: () => void;
  onNewFolder: () => void;
  onRename: (path: string | null) => void;
  /** Takes the name typed for a folder, or the title typed for a page. */
  onRenamed: (node: TreeNode, name: string) => void;
  onDelete: (node: TreeNode) => void;
  /** Gives the project another name; only where the app can. Rejects with why not. */
  onRenameProject?: (name: string) => Promise<void>;
  /** Opens another project; only where the app can. */
  onSwitchProject?: () => void;
  switchLabel?: string;
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

function Rows({
  nodes,
  depth,
  ...props
}: SidebarProps & { nodes: TreeNode[]; depth: number }) {
  return (
    <ul
      role={depth === 0 ? "tree" : "group"}
      aria-label={depth === 0 ? "Pages" : undefined}
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
            className="grid size-5 flex-none place-items-center rounded text-muted-foreground hover:bg-foreground/10"
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
                className="row group"
                style={pad}
                onClick={() => props.onToggle(node.path)}
                onDoubleClick={() => props.onRename(node.path)}
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
                      label={`New page in ${node.label}`}
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
                )}
                style={pad}
                onDoubleClick={() => props.onRename(node.path)}
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
                      title="Double-click to rename"
                      onClick={() => props.onOpen(node.path)}
                      className="row-main min-w-0 flex-1 truncate text-left"
                    >
                      {node.label}
                    </button>
                    {slides && current && props.onNewSlide && (
                      <RowButton label="New slide" onClick={props.onNewSlide}>
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
  const [dragged, setDragged] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const open = path === props.active;
  const end = () => {
    setDragged(null);
    setTarget(null);
  };
  return (
    <ul role="group">
      {titles.map((title, index) => {
        const current = open && index === props.slide;
        return (
          <li
            key={index}
            role="treeitem"
            aria-selected={current}
            draggable={open && titles.length > 1}
            className={cn(
              "row group",
              current && "row-active",
              dragged === index && "opacity-40",
              target === index && dragged !== null && dragged !== index && "row-drop",
            )}
            style={{ paddingLeft: 4 + depth * 16 }}
            onDragStart={(event) => {
              setDragged(index);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(index));
            }}
            onDragOver={(event) => {
              if (dragged === null) return;
              event.preventDefault();
              setTarget(index);
            }}
            onDragEnd={end}
            onDrop={(event) => {
              event.preventDefault();
              if (dragged !== null) props.onMoveSlide?.(dragged, index);
              end();
            }}
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
      <button
        type="button"
        title="Rename project"
        onClick={() => setDraft(name)}
        className="h-7 min-w-0 flex-initial truncate rounded-md px-1 text-left hover:bg-accent"
      >
        {name}
      </button>
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

/** The project's pages as a tree, with the buttons to add to it. */
export function Sidebar(props: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Project">
      <div
        className="sidebar-head flex h-11 flex-none items-center gap-1 px-2 text-sm font-semibold"
        onPointerDown={dragWindow}
      >
        <Mark className="mark mr-1 size-[22px] flex-none" />
        <ProjectName name={props.projectName} onRename={props.onRenameProject} />
        <span className="flex-1" />
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

      <div className="flex h-6 items-center justify-between px-2 pt-1 pb-1 text-xs font-medium text-muted-foreground">
        Pages
        <span className="flex gap-0.5">
          <button
            type="button"
            aria-label="New folder"
            title="New folder"
            onClick={props.onNewFolder}
            className="grid size-6 place-items-center rounded-md hover:bg-accent hover:text-foreground"
          >
            <FolderPlus className="size-3.5" aria-hidden />
          </button>
          {props.onNewPresentation && (
            <button
              type="button"
              aria-label="New presentation"
              title="New presentation"
              onClick={props.onNewPresentation}
              className="grid size-6 place-items-center rounded-md hover:bg-accent hover:text-foreground"
            >
              <Presentation className="size-3.5" aria-hidden />
            </button>
          )}
          <button
            type="button"
            aria-label="New page"
            title="New page"
            onClick={() => props.onNewPage("")}
            className="grid size-6 place-items-center rounded-md hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {props.tree.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">No pages yet.</p>
        ) : (
          <Rows {...props} nodes={props.tree} depth={0} />
        )}
      </div>
    </aside>
  );
}
