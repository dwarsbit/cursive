/**
 * Earlier versions of a page, as snapshots: the page as it was at some
 * moment. Each store keeps them its own way: the desktop app in its data
 * folder, the browser in its storage, an account on the server.
 */

export interface PageSnapshot {
  id: string;
  /** When the page was like this, in milliseconds since 1970. */
  at: number;
  /** The page's file. */
  source: string;
}

export interface PageHistory {
  /** The page's snapshots, newest first. */
  list(path: string): Promise<PageSnapshot[]>;
  /** Keeps the page as it is now, before a restore replaces it. */
  keep?(path: string, source: string): Promise<void>;
  /**
   * Puts a snapshot back where the store does that itself, keeping the
   * page as it is now first. Without it, the window writes the snapshot.
   */
  restore?(path: string, snapshot: PageSnapshot): Promise<void>;
}

/** How long a page keeps changing before its next snapshot: 10 minutes. */
export const SNAPSHOT_EVERY_MS = 10 * 60 * 1000;

/** Snapshots newest first; of a run with the same text, only the oldest, when it became so. */
export function distinctSnapshots(snapshots: PageSnapshot[]): PageSnapshot[] {
  const sorted = [...snapshots].sort((a, b) => b.at - a.at);
  return sorted.filter(
    (snapshot, index) => index === sorted.length - 1 || sorted[index + 1].source !== snapshot.source,
  );
}

/**
 * Before a page's file is replaced by `next`: the snapshots with the
 * page as it is now added, when it changes and the newest is old enough.
 * `force` keeps it whatever the newest's age, as before a restore.
 */
export function keepSnapshot(
  snapshots: PageSnapshot[],
  current: string | undefined,
  next: string,
  now: number,
  { since = now, force = false, max = 30 }: { since?: number; force?: boolean; max?: number } = {},
): PageSnapshot[] {
  if (current === undefined || current === next || !current.trim()) return snapshots;
  const newest = snapshots[0];
  if (newest && newest.source === current) return snapshots;
  if (newest && !force && now - newest.at < SNAPSHOT_EVERY_MS) return snapshots;
  const at = Math.max(Math.min(since, now), (newest?.at ?? 0) + 1);
  return [{ id: String(at), at, source: current }, ...snapshots].slice(0, max);
}

/** When a snapshot was, for its row: "Today, 14:05", "Yesterday, 09:30", "Nov 12, 16:20". */
export function snapshotTime(at: number, now = Date.now()): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const day = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(date)) / 86_400_000);
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const year = date.getFullYear() === new Date(now).getFullYear() ? "" : `, ${date.getFullYear()}`;
  return `${month} ${date.getDate()}${year}, ${time}`;
}
