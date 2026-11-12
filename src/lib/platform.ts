import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "./desktop-store";

/** True on macOS. */
export const isMac =
  typeof navigator !== "undefined" &&
  /Mac/.test(navigator.platform || navigator.userAgent);

/**
 * The macOS window has no title bar: its three window buttons sit over
 * the top left of the app, which keeps that corner free for them.
 */
export const hasWindowButtons = isMac && isDesktop;

/**
 * Drags the window by the part of the app that was pressed, as a title
 * bar would. Buttons, fields and links in it keep working.
 */
export function dragWindow(event: React.PointerEvent): void {
  if (!isDesktop || event.button !== 0) return;
  if ((event.target as HTMLElement).closest("button, input, a, [role='menu']")) return;
  void import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
    .catch(() => {});
}

/** "Today", "Yesterday", "Oct 28", or "Oct 28, 2025" in another year. */
export function formatOpened(time: number, now = new Date()): string {
  const date = new Date(time);
  const day = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/** Opens a web address in the browser: the system's, in the desktop app. */
export function openExternal(url: string): void {
  if (!isDesktop) {
    window.open(url, "_blank", "noopener");
    return;
  }
  invoke("open_in_browser", { url }).catch(() => {});
}
