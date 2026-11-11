import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import type { Editor } from "@tiptap/core";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";

export interface MathTarget {
  pos: number;
  kind: "blockMath" | "inlineMath";
}

/** A small field under an equation to write its TeX. */
export function MathPopover({
  editor,
  target,
  onClose,
}: {
  editor: Editor;
  target: MathTarget;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const node = editor.state.doc.nodeAt(target.pos);
  const [latex, setLatex] = useState((node?.attrs.latex as string | undefined) ?? "");

  useLayoutEffect(() => {
    const popover = ref.current;
    const anchor = editor.view.nodeDOM(target.pos);
    if (!popover || !(anchor instanceof HTMLElement)) return;
    void computePosition(anchor, popover, {
      placement: "bottom",
      strategy: "fixed",
      middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      popover.style.left = `${x}px`;
      popover.style.top = `${y}px`;
      popover.style.opacity = "1";
    });
  }, [editor, target.pos, latex]);

  // The editor takes the focus back a frame after a block is inserted,
  // so the field asks for it after that.
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => field.current?.focus());
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);

  const update = (value: string) => {
    setLatex(value);
    editor
      .chain()
      .command(({ tr }) => {
        const current = tr.doc.nodeAt(target.pos);
        if (current?.type.name !== target.kind) return false;
        tr.setNodeMarkup(target.pos, undefined, { ...current.attrs, latex: value });
        return true;
      })
      .run();
  };

  /**
   * Closes the field. Enter goes on writing under the equation, Escape
   * leaves it selected, and a click elsewhere keeps the caret there.
   */
  const finish = (how: "enter" | "escape" | "outside") => {
    onClose();
    const current = editor.state.doc.nodeAt(target.pos);
    if (current?.type.name !== target.kind) return;
    const end = target.pos + current.nodeSize;
    if (!latex.trim()) {
      // An equation left empty is removed again.
      editor.commands.deleteRange({ from: target.pos, to: end });
    } else if (how === "escape") {
      editor.commands.setNodeSelection(target.pos);
    } else if (how === "enter" && target.kind === "inlineMath") {
      editor.commands.setTextSelection(end);
    } else if (how === "enter") {
      const next = editor.state.doc.nodeAt(end);
      const chain = editor.chain();
      if (next?.type.name !== "paragraph" || next.content.size > 0) {
        chain.insertContentAt(end, { type: "paragraph" });
      }
      chain.setTextSelection(end + 1).run();
    }
    // The page takes the keys again at once, so nothing typed is lost.
    if (how !== "outside") editor.view.focus();
  };
  const onOutside = useEffectEvent(() => finish("outside"));
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onOutside();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  return (
    <div
      ref={ref}
      className="popover fixed z-30 w-[min(22rem,calc(100vw-1rem))] p-2"
      // Transparent until it is placed; a hidden field could not take the focus.
      style={{ opacity: 0 }}
    >
      <textarea
        ref={field}
        autoFocus
        rows={target.kind === "blockMath" ? 3 : 1}
        value={latex}
        spellCheck={false}
        aria-label="Equation in TeX"
        placeholder="E = mc^2"
        onChange={(event) => update(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            finish("escape");
          } else if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            finish("enter");
          }
        }}
        className="block w-full resize-none rounded-md border bg-background px-2 py-1.5 font-mono text-[13px] outline-none focus:border-ring"
      />
      <p className="px-1 pt-1.5 text-2xs text-muted-foreground">
        Written in TeX. Enter to finish, Shift + Enter for a new line.
      </p>
    </div>
  );
}
