import { ChevronRight, FileText, Folder, FolderPlus, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { countPages, type TreeNode } from "@/lib/project";

export interface SidebarProps {
  projectName: string;
  tree: TreeNode[];
  /** The open page's path. */
  active: string | null;
  /** Folders shown closed. */
  closed: ReadonlySet<string>;
  /** A folder whose name is being typed, right after it was made. */
  renaming: string | null;
  onOpen: (path: string) => void;
  onToggle: (path: string) => void;
  onNewPage: (folder: string) => void;
  onNewFolder: () => void;
  onRename: (path: string | null) => void;
  onRenameFolder: (path: string, name: string) => void;
  onDelete: (node: TreeNode) => void;
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

function FolderName({
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
      aria-label="Folder name"
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
        const open = node.kind === "folder" && !props.closed.has(node.path);
        const current = node.path === props.active;
        const pad = { paddingLeft: 4 + depth * 16 };
        return (
          <li
            key={node.path}
            role="treeitem"
            aria-expanded={node.kind === "folder" ? open : undefined}
            aria-selected={current}
          >
            {node.kind === "folder" ? (
              <div
                className="row group"
                style={pad}
                onClick={() => props.onToggle(node.path)}
                onDoubleClick={() => props.onRename(node.path)}
              >
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
                <Folder
                  className="size-3.5 flex-none text-muted-foreground"
                  aria-hidden
                />
                {props.renaming === node.path ? (
                  <FolderName
                    node={node}
                    onDone={(name) => {
                      props.onRename(null);
                      if (name !== null) props.onRenameFolder(node.path, name);
                    }}
                  />
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
              <div className={cn("row group", current && "row-active")} style={pad}>
                <span className="size-5 flex-none" />
                <FileText
                  className={cn(
                    "size-3.5 flex-none",
                    current ? "text-tint" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <button
                  type="button"
                  aria-current={current ? "page" : undefined}
                  onClick={() => props.onOpen(node.path)}
                  className="row-main min-w-0 flex-1 truncate text-left"
                >
                  {node.label}
                </button>
                <RowButton
                  label={`Delete ${node.label}`}
                  onClick={() => props.onDelete(node)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </RowButton>
              </div>
            )}
            {open && node.children.length > 0 && (
              <Rows {...props} nodes={node.children} depth={depth + 1} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The project's pages as a tree, with the buttons to add to it. */
export function Sidebar(props: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Project">
      <div className="flex h-9 items-center gap-2 px-2 text-sm font-semibold">
        <span
          aria-hidden
          className="grid size-[22px] flex-none place-items-center rounded-md bg-primary-fill font-serif text-sm font-semibold text-primary-foreground italic shadow-[inset_0_0_0_1px_var(--primary-edge)]"
        >
          C
        </span>
        <span className="min-w-0 flex-1 truncate">{props.projectName}</span>
      </div>

      <div className="flex h-6 items-center justify-between px-2 pt-3 pb-1 text-xs font-medium text-muted-foreground">
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
