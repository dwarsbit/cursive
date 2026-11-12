import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { syncRun, type Folder, type Link } from "./link-sync";
import { fromBase64, newDoc, readPages, toBase64, writeDocPage } from "./project-doc";
import { Server, ServerError, type Transport } from "./server";

/** A server with one project's document, speaking the API's two sync calls. */
function fakeServer() {
  const doc = newDoc();
  let online = true;
  const transport: Transport = async (_method, path, body) => {
    if (!online) throw new ServerError(0, "offline", "offline");
    if (path.endsWith("/document/sync")) {
      const { stateVector } = (body as { json: { stateVector: string } }).json;
      return {
        status: 200,
        body: JSON.stringify({
          update: toBase64(Y.encodeStateAsUpdate(doc, fromBase64(stateVector))),
          stateVector: toBase64(Y.encodeStateVector(doc)),
        }),
      };
    }
    if (path.endsWith("/document/update")) {
      Y.applyUpdate(doc, (body as { bytes: Uint8Array }).bytes);
      return { status: 204, body: "" };
    }
    return { status: 404, body: "" };
  };
  return {
    doc,
    server: new Server(transport),
    pages: () => readPages(doc),
    setOnline: (value: boolean) => (online = value),
  };
}

function computer(pages: Record<string, string> = {}) {
  const disk = { ...pages };
  const folder: Folder = {
    read: async () => ({ ...disk }),
    write: async (path, source) => void (disk[path] = source),
    remove: async (path) => void delete disk[path],
  };
  let link: Link = { projectId: "p1", state: "" };
  return {
    disk,
    sync: async (server: Server, writable = true) => {
      const result = await syncRun(server, folder, link, writable);
      link = result.link;
      return result;
    },
  };
}

describe("syncRun", () => {
  it("sends a folder's pages on the first run and brings them to another computer", async () => {
    const { server, pages } = fakeServer();
    const laptop = computer({ "Home.md": "# Home\n", "Thesis/Outline.md": "One\n" });
    const first = await laptop.sync(server);
    expect(first.sent).toBe(true);
    expect(first.changes).toEqual([]);
    expect(pages()).toEqual({ "Home.md": "# Home\n", "Thesis/Outline.md": "One\n" });

    const desktop = computer();
    const second = await desktop.sync(server);
    expect(second.sent).toBe(false);
    expect(desktop.disk).toEqual(laptop.disk);
    expect(second.changes).toContainEqual({
      path: "Home.md",
      base: null,
      text: "# Home\n",
    });
  });

  it("sends nothing when nothing changed", async () => {
    const { server } = fakeServer();
    const laptop = computer({ "a.md": "text\n" });
    await laptop.sync(server);
    const again = await laptop.sync(server);
    expect(again.sent).toBe(false);
    expect(again.changes).toEqual([]);
  });

  it("brings two computers' changes to one page together", async () => {
    const { server } = fakeServer();
    const laptop = computer({ "a.md": "First line\n\nLast line\n" });
    await laptop.sync(server);
    const desktop = computer();
    await desktop.sync(server);

    laptop.disk["a.md"] = "First line, from the laptop\n\nLast line\n";
    desktop.disk["a.md"] = "First line\n\nLast line, from the desktop\n";
    await laptop.sync(server);
    const run = await desktop.sync(server);
    await laptop.sync(server);

    const merged = "First line, from the laptop\n\nLast line, from the desktop\n";
    expect(desktop.disk["a.md"]).toBe(merged);
    expect(laptop.disk["a.md"]).toBe(merged);
    expect(run.changes).toEqual([
      {
        path: "a.md",
        base: "First line\n\nLast line, from the desktop\n",
        text: merged,
      },
    ]);
  });

  it("carries deleted, moved and new pages both ways", async () => {
    const { server, pages } = fakeServer();
    const laptop = computer({ "a.md": "A\n", "b.md": "B\n", "c.md": "C\n" });
    await laptop.sync(server);
    const desktop = computer();
    await desktop.sync(server);

    delete laptop.disk["a.md"];
    laptop.disk["Folder/b.md"] = laptop.disk["b.md"];
    delete laptop.disk["b.md"];
    desktop.disk["d.md"] = "D\n";
    await laptop.sync(server);
    await desktop.sync(server);
    await laptop.sync(server);

    const expected = { "Folder/b.md": "B\n", "c.md": "C\n", "d.md": "D\n" };
    expect(pages()).toEqual(expected);
    expect(laptop.disk).toEqual(expected);
    expect(desktop.disk).toEqual(expected);
  });

  it("takes what the browser wrote", async () => {
    const { server, doc } = fakeServer();
    const laptop = computer({ "a.md": "A\n" });
    await laptop.sync(server);
    writeDocPage(doc, "a.md", "A, from the browser\n");
    writeDocPage(doc, "new.md", "New\n");
    const run = await laptop.sync(server);
    expect(laptop.disk).toEqual({ "a.md": "A, from the browser\n", "new.md": "New\n" });
    expect(run.sent).toBe(false);
  });

  it("changes nothing when the server can't be reached, and catches up after", async () => {
    const { server, pages, setOnline } = fakeServer();
    const laptop = computer({ "a.md": "A\n" });
    await laptop.sync(server);
    setOnline(false);
    laptop.disk["a.md"] = "A, written offline\n";
    await expect(laptop.sync(server)).rejects.toMatchObject({ status: 0 });
    expect(laptop.disk["a.md"]).toBe("A, written offline\n");
    setOnline(true);
    await laptop.sync(server);
    expect(pages()).toEqual({ "a.md": "A, written offline\n" });
  });

  it("only reads a project that can't be changed", async () => {
    const { server, pages, doc } = fakeServer();
    writeDocPage(doc, "a.md", "Theirs\n");
    const reader = computer({ "mine.md": "Mine\n" });
    const run = await reader.sync(server, false);
    expect(run.sent).toBe(false);
    expect(pages()).toEqual({ "a.md": "Theirs\n" });
    expect(reader.disk["a.md"]).toBe("Theirs\n");
  });
});
