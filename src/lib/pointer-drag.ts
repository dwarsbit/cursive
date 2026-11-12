/**
 * Dragging with the pointer, without the browser's drag and drop
 * (which the desktop app's window takes for dropping files). A press
 * becomes a drag once the pointer has moved a few pixels; until then
 * it stays a click. Escape cancels a drag.
 */
export interface PointerDrag {
  /** The pointer moved far enough: the drag starts. */
  onStart?(event: PointerEvent): void;
  onMove(event: PointerEvent): void;
  /** The button was let go after a drag. */
  onDrop(event: PointerEvent): void;
  /** Always last: after a drop, a cancel or a press that stayed a click. */
  onEnd?(): void;
  /** How far, in pixels, the pointer moves before the drag starts. */
  threshold?: number;
  /** The cursor while dragging. */
  cursor?: string;
}

export function startPointerDrag(
  press: { clientX: number; clientY: number; pointerId: number },
  drag: PointerDrag,
): void {
  const threshold = drag.threshold ?? 4;
  let started = false;
  const style = document.body.style;
  const cursor = style.cursor;

  const finish = () => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    window.removeEventListener("keydown", key, true);
    document.documentElement.classList.remove("pointer-dragging");
    style.cursor = cursor;
    drag.onEnd?.();
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== press.pointerId) return;
    if (!started) {
      const distance = Math.hypot(
        event.clientX - press.clientX,
        event.clientY - press.clientY,
      );
      if (distance < threshold) return;
      started = true;
      document.documentElement.classList.add("pointer-dragging");
      style.cursor = drag.cursor ?? "grabbing";
      drag.onStart?.(event);
    }
    event.preventDefault();
    drag.onMove(event);
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId !== press.pointerId) return;
    if (started) {
      // The click that follows the button going up is part of the drag.
      const swallow = (click: MouseEvent) => {
        click.preventDefault();
        click.stopPropagation();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      drag.onDrop(event);
    }
    finish();
  };
  const cancel = (event: PointerEvent) => {
    if (event.pointerId === press.pointerId) finish();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    finish();
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  window.addEventListener("keydown", key, true);
}

/** Scrolls `container` when the pointer is near its top or bottom edge. */
export function scrollNearEdge(container: Element | null, clientY: number): void {
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const edge = 48;
  if (clientY < rect.top + edge) container.scrollTop -= 12;
  else if (clientY > rect.bottom - edge) container.scrollTop += 12;
}
