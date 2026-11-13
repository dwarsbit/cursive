import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BlockItem } from "../editor/blocks";
import type { SlashController, SlashState } from "../editor/slash";
import { cn } from "../lib/cn";

export function BlockGlyph({ glyph }: { glyph: BlockItem["glyph"] }) {
  const Icon = typeof glyph === "string" ? null : glyph;
  return (
    <span className="grid size-9 flex-none place-items-center rounded-md bg-card text-[13px] font-semibold text-accent-foreground shadow-[inset_0_0_0_1px_var(--border)]">
      {Icon ? <Icon className="size-[18px]" aria-hidden /> : (glyph as string)}
    </span>
  );
}

/** The list of blocks under a typed slash. */
export function SlashMenu({
  state,
  controller,
}: {
  state: SlashState;
  controller: SlashController;
}) {
  const { items, query, rect, pick } = state;
  const [selected, setSelected] = useState(0);
  const [lastQuery, setLastQuery] = useState(query);
  const menuRef = useRef<HTMLDivElement>(null);

  // A new query starts at the first match again.
  if (query !== lastQuery) {
    setLastQuery(query);
    setSelected(0);
  }
  const index = Math.min(selected, Math.max(0, items.length - 1));

  // The arrow keys and Enter go to the menu while it is open.
  useEffect(
    () =>
      controller.handleKeys((event) => {
        if (!items.length) return false;
        if (event.key === "ArrowDown") {
          setSelected((index + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelected((index + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          pick(items[index]);
          return true;
        }
        return false;
      }),
    [controller, items, index, pick],
  );

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const anchor = {
      getBoundingClientRect: () => rect() ?? new DOMRect(),
    };
    void computePosition(anchor, menu, {
      placement: "bottom-start",
      strategy: "fixed",
      middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      menu.style.visibility = "visible";
    });
  }, [rect, items.length]);

  useEffect(() => {
    menuRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index, query]);

  const groups = items.reduce<Array<{ name: string; items: BlockItem[] }>>(
    (all, item) => {
      const last = all[all.length - 1];
      if (last?.name === item.group) last.items.push(item);
      else all.push({ name: item.group, items: [item] });
      return all;
    },
    [],
  );

  return (
    <div
      ref={menuRef}
      role="listbox"
      aria-label="Insert block"
      className="popover fixed z-30 flex max-h-[min(22rem,60vh)] w-[280px] flex-col text-[13px]"
      style={{ visibility: "hidden" }}
      // Keeps the caret in the editor when the menu is clicked.
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {items.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No block matches “{query}”.
          </p>
        )}
        {groups.map((group, groupIndex) => (
          <div key={`${groupIndex}:${group.name}`} role="group" aria-label={group.name}>
            <div className="px-2 pt-2 pb-1 text-2xs font-medium text-muted-foreground">
              {group.name}
            </div>
            {group.items.map((item) => {
              const on = items[index] === item;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-[5px] text-left",
                    on && "bg-accent",
                  )}
                  onMouseEnter={() => setSelected(items.indexOf(item))}
                  onClick={() => pick(item)}
                >
                  <BlockGlyph glyph={item.glyph} />
                  <span className="min-w-0">
                    <span className="block font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-none justify-between border-t px-3 py-1.5 text-2xs text-muted-foreground">
        <span>↑↓ to choose, ↵ to insert</span>
        <span>Esc to close</span>
      </div>
    </div>
  );
}
