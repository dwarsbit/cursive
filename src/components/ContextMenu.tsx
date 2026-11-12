import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export type MenuEntry =
  { label: string; onSelect: () => void; destructive?: boolean } | "separator";

export interface MenuAt {
  x: number;
  y: number;
  entries: MenuEntry[];
}

/** A menu at the pointer, as a right-click opens it. */
export function ContextMenu({ menu, onClose }: { menu: MenuAt; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: menu.x, top: menu.y });

  // Kept inside the window.
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPlace({
      left: Math.max(4, Math.min(menu.x, window.innerWidth - box.width - 4)),
      top: Math.max(4, Math.min(menu.y, window.innerHeight - box.height - 4)),
    });
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [menu]);

  useEffect(() => {
    const outside = (event: Event) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const items = [
      ...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="popover context-menu"
      style={place}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.entries.map((entry, index) =>
        entry === "separator" ? (
          <div key={index} role="separator" className="context-menu-separator" />
        ) : (
          <button
            key={index}
            type="button"
            role="menuitem"
            className={cn(entry.destructive && "text-destructive")}
            onClick={() => {
              onClose();
              entry.onSelect();
            }}
          >
            {entry.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
