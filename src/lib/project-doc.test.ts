import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  applyPages,
  decodeDoc,
  diffPages,
  encodeDoc,
  mergeText,
  newDoc,
  pageIds,
  readPages,
  removeFromDoc,
  renameInDoc,
  replaceText,
  writeDocPage,
} from "./project-doc";

describe("the project document", () => {
  it("keeps pages by path and survives a round trip", () => {
    const doc = newDoc();
    writeDocPage(doc, "Home.md", "# Home\n");
    writeDocPage(doc, "Thesis/Outline.md", "One\n");
    writeDocPage(doc, "Home.md", "# Home, again\n");
    const copy = decodeDoc(encodeDoc(doc));
    expect(readPages(copy)).toEqual({
      "Home.md": "# Home, again\n",
      "Thesis/Outline.md": "One\n",
    });
    expect(copy.getMap("meta").get("layout")).toBe(1);
  });

  it("leaves what isn't a page alone", () => {
    const doc = newDoc();
    const text = new Y.Text("\\documentclass{article}");
    doc.getMap("texts").set("x", text);
    doc.getMap("paths").set("x", "main.tex");
    writeDocPage(doc, ".hidden/a.md", "hidden");
    expect(readPages(doc)).toEqual({});
    applyPages(doc, { "a.md": "A\n" });
    expect(doc.getMap("paths").get("x")).toBe("main.tex");
    expect(readPages(doc)).toEqual({ "a.md": "A\n" });
  });

  it("moves and deletes a page, or a folder of pages", () => {
    const doc = newDoc();
    writeDocPage(doc, "Thesis/a.md", "A");
    writeDocPage(doc, "Thesis/Deep/b.md", "B");
    writeDocPage(doc, "c.md", "C");
    const id = pageIds(doc).get("Thesis/a.md");
    renameInDoc(doc, "Thesis", "Book");
    expect(pageIds(doc).get("Book/a.md")).toBe(id);
    renameInDoc(doc, "c.md", "d.md");
    expect(Object.keys(readPages(doc)).sort()).toEqual([
      "Book/Deep/b.md",
      "Book/a.md",
      "d.md",
    ]);
    removeFromDoc(doc, "Book");
    expect(readPages(doc)).toEqual({ "d.md": "C" });
  });

  it("gives a path to the smallest id when two files claim it", () => {
    const doc = newDoc();
    doc.getMap("texts").set("bbbbbbbb-2", new Y.Text("second"));
    doc.getMap("paths").set("bbbbbbbb-2", "a.md");
    doc.getMap("texts").set("aaaaaaaa-1", new Y.Text("first"));
    doc.getMap("paths").set("aaaaaaaa-1", "a.md");
    expect(readPages(doc)).toEqual({
      "a.md": "first",
      "a (conflict bbbbbbbb).md": "second",
    });
  });

  it("keeps a moved page's id when the folder is applied", () => {
    const doc = newDoc();
    writeDocPage(doc, "a.md", "Same text");
    const id = pageIds(doc).get("a.md");
    applyPages(doc, { "Folder/a.md": "Same text" });
    expect(pageIds(doc).get("Folder/a.md")).toBe(id);
    expect(Object.keys(readPages(doc))).toEqual(["Folder/a.md"]);
  });
});

describe("replaceText", () => {
  it("changes only what differs, so two edits to one text both stay", () => {
    const a = new Y.Doc();
    a.getText("t").insert(0, "one two three");
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    replaceText(a.getText("t"), "ONE two three");
    replaceText(b.getText("t"), "one two THREE");
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    expect(a.getText("t").toString()).toBe("ONE two THREE");
  });

  it("never splits an emoji", () => {
    const doc = new Y.Doc();
    const text = doc.getText("t");
    text.insert(0, "a 😀 b");
    replaceText(text, "a 😁 b");
    expect(text.toString()).toBe("a 😁 b");
  });
});

describe("mergeText", () => {
  it("brings two changes to one text together", () => {
    expect(mergeText("a\nb\nc\n", "A\nb\nc\n", "a\nb\nC\n")).toBe("A\nb\nC\n");
    expect(mergeText("a", "a", "b")).toBe("b");
    expect(mergeText("a", "b", "a")).toBe("b");
    expect(mergeText("a", "b", "b")).toBe("b");
  });
});

describe("diffPages", () => {
  it("lists what was added, changed and deleted", () => {
    expect(
      diffPages(
        { "a.md": "1", "b.md": "2", "c.md": "3" },
        { "a.md": "1", "b.md": "x", "d.md": "4" },
      ),
    ).toEqual([
      { path: "b.md", base: "2", text: "x" },
      { path: "c.md", base: "3", text: null },
      { path: "d.md", base: null, text: "4" },
    ]);
  });
});
