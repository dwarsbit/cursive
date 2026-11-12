import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyChanges } from "./project";
import { newDoc, readPages, writeDocPage, type PageChange } from "./project-doc";
import { Server } from "./server";
import { serverStore, type Connect } from "./server-store";

/** A server's document that every connected window's document follows. */
function hub(writable = true) {
  const remote = newDoc();
  const connect: Connect = async (_id, doc) => {
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote));
    const up = (update: Uint8Array, origin: unknown) => {
      if (origin !== "hub") Y.applyUpdate(remote, update, doc);
    };
    const down = (update: Uint8Array, origin: unknown) => {
      if (origin !== doc) Y.applyUpdate(doc, update, "hub");
    };
    doc.on("update", up);
    remote.on("update", down);
    return {
      unsynced: () => 0,
      onUnsynced: () => {},
      close: () => {
        doc.off("update", up);
        remote.off("update", down);
      },
    };
  };
  const server = new Server(async () => ({
    status: 200,
    body: JSON.stringify({ id: "p1", name: "Notes", writable }),
  }));
  return { remote, open: () => serverStore(server, "p1", connect) };
}

describe("serverStore", () => {
  it("loads the account's project and writes changes to its document", async () => {
    const { remote, open } = hub();
    writeDocPage(remote, "Home.md", "# Home\n");
    const store = open();
    const project = await store.load();
    expect(project).toEqual({
      name: "Notes",
      folders: [],
      pages: { "Home.md": "# Home\n" },
    });

    await store.writePage("Home.md", "# Home, edited\n");
    await store.writePage("Thesis/Outline.md", "One\n");
    await store.rename("Thesis", "Book");
    expect(readPages(remote)).toEqual({
      "Home.md": "# Home, edited\n",
      "Book/Outline.md": "One\n",
    });
    await store.remove("Book");
    expect(readPages(remote)).toEqual({ "Home.md": "# Home, edited\n" });
  });

  it("tells of changes from another window, and not of its own", async () => {
    const { open } = hub();
    const mine = open();
    const theirs = open();
    await mine.load();
    await theirs.load();
    const heard: PageChange[][] = [];
    mine.subscribe!((changes) => heard.push(changes));

    await mine.writePage("a.md", "A\n");
    expect(heard).toEqual([]);
    await theirs.writePage("a.md", "A, from the other window\n");
    await theirs.writePage("b.md", "B\n");
    expect(heard).toEqual([
      [{ path: "a.md", base: "A\n", text: "A, from the other window\n" }],
      [{ path: "b.md", base: null, text: "B\n" }],
    ]);
  });

  it("starts an empty project in the layout the server knows", async () => {
    const { remote, open } = hub();
    remote.getMap("meta").delete("layout");
    await open().load();
    expect(remote.getMap("meta").get("layout")).toBe(1);
  });
});

describe("applyChanges", () => {
  const project = {
    name: "Notes",
    folders: [],
    pages: { "a.md": "one\ntwo\n", "b.md": "B\n" },
  };

  it("takes a page that wasn't changed here as it is now", () => {
    const { project: next, writes } = applyChanges(project, [
      { path: "a.md", base: "one\ntwo\n", text: "one\nTWO\n" },
      { path: "b.md", base: "B\n", text: null },
      { path: "c.md", base: null, text: "C\n" },
    ]);
    expect(next.pages).toEqual({ "a.md": "one\nTWO\n", "c.md": "C\n" });
    expect(writes).toEqual([]);
  });

  it("keeps both changes to a page that was also changed here", () => {
    const { project: next, writes } = applyChanges(
      { ...project, pages: { ...project.pages, "a.md": "ONE\ntwo\n" } },
      [{ path: "a.md", base: "one\ntwo\n", text: "one\nTWO\n" }],
    );
    expect(next.pages["a.md"]).toBe("ONE\nTWO\n");
    expect(writes).toEqual([["a.md", "ONE\nTWO\n"]]);
  });

  it("keeps a page that was deleted elsewhere but changed here", () => {
    const { project: next, writes } = applyChanges(
      { ...project, pages: { ...project.pages, "b.md": "B, edited\n" } },
      [{ path: "b.md", base: "B\n", text: null }],
    );
    expect(next.pages["b.md"]).toBe("B, edited\n");
    expect(writes).toEqual([["b.md", "B, edited\n"]]);
  });
});
