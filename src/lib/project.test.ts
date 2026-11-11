import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  buildTree,
  countPages,
  fileNameFor,
  freePath,
  removeFrom,
  renameIn,
  type Project,
  type TreeNode,
} from "./project";

const project: Project = {
  name: "Research notes",
  folders: ["Thesis", "Thesis/Literature", "Empty"],
  pages: {
    "Thesis/Pilot study plan.md": "---\ntitle: Pilot study plan\n---\n\nText.",
    "Thesis/Literature/smith.md": "---\ntitle: Smith 2024\n---\n",
    "Thesis/Chapter outline.md": "No front matter.",
    "Reading list.md": "---\ntitle: Reading list\n---\n",
    "ideas.md": "",
  },
};

const outline = (nodes: TreeNode[], depth = 0): string[] =>
  nodes.flatMap((node) => [
    `${"  ".repeat(depth)}${node.kind === "folder" ? "+" : "-"} ${node.label}`,
    ...outline(node.children, depth + 1),
  ]);

describe("buildTree", () => {
  it("lists folders first, then pages, each by name", () => {
    expect(outline(buildTree(project))).toEqual([
      "+ Empty",
      "+ Thesis",
      "  + Literature",
      "    - Smith 2024",
      "  - Chapter outline",
      "  - Pilot study plan",
      "- ideas",
      "- Reading list",
    ]);
  });

  it("makes the folders of a page that are not listed", () => {
    const tree = buildTree({ name: "", folders: [], pages: { "a/b/c.md": "" } });
    expect(outline(tree)).toEqual(["+ a", "  + b", "    - c"]);
  });

  it("counts the pages in a folder at any depth", () => {
    const thesis = buildTree(project).find((node) => node.label === "Thesis")!;
    expect(countPages(thesis)).toBe(3);
  });
});

describe("fileNameFor", () => {
  it("keeps a readable name", () => {
    expect(fileNameFor("Pilot study plan")).toBe("Pilot study plan");
    expect(fileNameFor("Über die Methode")).toBe("Über die Methode");
  });

  it("takes out what a file name can't hold", () => {
    expect(fileNameFor('Notes: week 46/47 "draft"?')).toBe("Notes week 46 47 draft");
    expect(fileNameFor("  .hidden.  ")).toBe("hidden");
  });

  it("falls back to Untitled", () => {
    expect(fileNameFor("")).toBe("Untitled");
    expect(fileNameFor("???")).toBe("Untitled");
    expect(fileNameFor("CON")).toBe("Untitled");
  });
});

describe("freePath", () => {
  it("takes the name when it is free", () => {
    expect(freePath(project, "Thesis", "Methods", ".md")).toBe("Thesis/Methods.md");
    expect(freePath(project, "", "Teaching", "")).toBe("Teaching");
  });

  it("numbers a name that is taken, whatever its case", () => {
    expect(freePath(project, "", "reading list", ".md")).toBe("reading list 2.md");
    expect(freePath(project, "", "Thesis", "")).toBe("Thesis 2");
  });

  it("lets a page keep its own path", () => {
    expect(freePath(project, "", "Reading list", ".md", "Reading list.md")).toBe(
      "Reading list.md",
    );
  });
});

describe("renameIn and removeFrom", () => {
  it("moves a folder with everything in it", () => {
    const next = renameIn(project, "Thesis", "Dissertation");
    expect(next.folders).toEqual(["Dissertation", "Dissertation/Literature", "Empty"]);
    expect(Object.keys(next.pages)).toContain("Dissertation/Literature/smith.md");
    expect(Object.keys(next.pages)).not.toContain("Thesis/Literature/smith.md");
  });

  it("moves one page and leaves a longer name alone", () => {
    const next = renameIn(project, "ideas.md", "Ideas for later.md");
    expect(Object.keys(next.pages)).toContain("Ideas for later.md");
    expect(next.pages["Reading list.md"]).toBe(project.pages["Reading list.md"]);
  });

  it("deletes a folder with everything in it", () => {
    const next = removeFrom(project, "Thesis");
    expect(next.folders).toEqual(["Empty"]);
    expect(Object.keys(next.pages)).toEqual(["Reading list.md", "ideas.md"]);
  });
});

describe("ancestorsOf", () => {
  it("lists the folders around a page, outermost first", () => {
    expect(ancestorsOf("Thesis/Literature/smith.md")).toEqual([
      "Thesis",
      "Thesis/Literature",
    ]);
    expect(ancestorsOf("ideas.md")).toEqual([]);
  });
});
