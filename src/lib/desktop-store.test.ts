import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ command: string; args: Record<string, unknown> }> = [];
let failWith: string | null = null;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (command: string, args: Record<string, unknown>) => {
    calls.push({ command, args });
    if (failWith) throw failWith;
    return undefined;
  },
}));

const { desktopStore } = await import("./desktop-store");

const names = () =>
  calls.map(
    (call) =>
      `${call.command.replace("project_", "")} ${call.args.path ?? call.args.from}`,
  );

beforeEach(() => {
  calls.length = 0;
  failWith = null;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("desktopStore", () => {
  it("writes a page once, a moment after the last change", async () => {
    const store = desktopStore("/notes");
    const first = store.writePage("a.md", "one");
    const second = store.writePage("a.md", "two");
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all([first, second]);
    expect(calls).toEqual([
      {
        command: "project_write_page",
        args: { dir: "/notes", path: "a.md", source: "two" },
      },
    ]);
  });

  it("writes a waiting page before it is renamed", async () => {
    const store = desktopStore("/notes");
    void store.writePage("Untitled.md", "text");
    await store.rename("Untitled.md", "Ideas.md");
    expect(names()).toEqual(["write_page Untitled.md", "rename Untitled.md"]);
  });

  it("doesn't write a page that is being deleted, or one in a deleted folder", async () => {
    const store = desktopStore("/notes");
    void store.writePage("Thesis/a.md", "text").catch(() => {});
    void store.writePage("b.md", "text");
    await store.remove("Thesis");
    expect(names()).toEqual(["write_page b.md", "remove Thesis"]);
  });

  it("reports a failed write as an error with the reason", async () => {
    const store = desktopStore("/notes");
    failWith = "can't write a.md: disk full";
    const write = store.writePage("a.md", "one");
    const outcome = expect(write).rejects.toThrow("can't write a.md: disk full");
    await vi.advanceTimersByTimeAsync(500);
    await outcome;
  });

  it("writes at once when asked to flush", async () => {
    const store = desktopStore("/notes");
    void store.writePage("a.md", "one");
    await store.flush();
    expect(names()).toEqual(["write_page a.md"]);
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toHaveLength(1);
  });
});
