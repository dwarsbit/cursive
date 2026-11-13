import { describe, expect, it } from "vitest";
import {
  backlinks,
  findLinks,
  linkIndex,
  matchPageLink,
  rebaseLinks,
  relativeHref,
  resolveRelative,
  retargetLinks,
  writePageLink,
} from "./links";

const page = (title: string, body = "") => `---\ntitle: ${title}\n---\n\n${body}`;

describe("page links", () => {
  it("reads and writes a link", () => {
    expect(matchPageLink("[[Pilot study]] and more")).toEqual({
      raw: "[[Pilot study]]",
      target: "Pilot study",
      label: "",
    });
    expect(matchPageLink("[[Thesis/Pilot|the pilot]]")?.label).toBe("the pilot");
    expect(matchPageLink("[[ ]]")).toBeNull();
    expect(matchPageLink("[Pilot]")).toBeNull();
    expect(writePageLink("Pilot", "the pilot")).toBe("[[Pilot|the pilot]]");
    expect(writePageLink("Pilot", "Pilot")).toBe("[[Pilot]]");
    expect(writePageLink("A [b]|c")).toBe("[[A b c]]");
  });

  it("finds a page by its title, its file name or its path", () => {
    const index = linkIndex({
      "Pilot.md": page("Pilot study"),
      "Thesis/Pilot.md": page("Pilot study"),
      "Reading list.md": "- Smith",
    });
    expect(index.resolve("pilot STUDY")).toBe("Pilot.md");
    expect(index.resolve("Thesis/Pilot")).toBe("Thesis/Pilot.md");
    expect(index.resolve("Reading list")).toBe("Reading list.md");
    expect(index.resolve("Pilot study#Method")).toBe("Pilot.md");
    expect(index.resolve("Missing")).toBeNull();
    // Two pages share a title: the one in a folder is named by its path.
    expect(index.targetFor("Thesis/Pilot.md")).toBe("Thesis/Pilot");
    expect(index.targetFor("Reading list.md")).toBe("Reading list");
  });

  it("finds links outside code", () => {
    const links = findLinks(
      "See [[Pilot]] and [the plan](Plan.md).\n\n`[[not a link]]`\n\n```\n[[nor this]]\n```\n\n![chart](a.png)",
    );
    expect(links.map((link) => [link.kind, link.target])).toEqual([
      ["wiki", "Pilot"],
      ["markdown", "Plan.md"],
    ]);
  });

  it("lists the pages that link to a page", () => {
    const pages = {
      "Pilot.md": page("Pilot study", "The plan."),
      "Notes/Week 46.md": page("Week 46", "- Ran the [[Pilot study|pilot]] with **12** students."),
      "Plan.md": page("Plan", "Read [the pilot](Pilot.md) first."),
      "Other.md": page("Other", "Nothing here."),
    };
    expect(backlinks(pages, "Pilot.md")).toEqual([
      { path: "Plan.md", title: "Plan", excerpt: "Read the pilot first." },
      {
        path: "Notes/Week 46.md",
        title: "Week 46",
        excerpt: "Ran the pilot with 12 students.",
      },
    ]);
  });

  it("names a page anew in the links to it after a new title", () => {
    const before = {
      "Pilot.md": page("Pilot"),
      "Plan.md": page("Plan", "See [[Pilot]] and [[pilot|the trial]], not [[Plan]]."),
    };
    const after = { ...before, "Pilot study.md": page("Pilot study") };
    delete (after as Record<string, string>)["Pilot.md"];
    expect(retargetLinks(before, after, "Pilot.md", "Pilot study.md")).toEqual([
      [
        "Plan.md",
        page("Plan", "See [[Pilot study]] and [[Pilot study|the trial]], not [[Plan]]."),
      ],
    ]);
  });

  it("leaves links alone that still find the page", () => {
    const before = { "Pilot.md": page("Pilot"), "Plan.md": page("Plan", "[[Pilot]]") };
    const after = { "Thesis/Pilot.md": page("Pilot"), "Plan.md": before["Plan.md"] };
    expect(retargetLinks(before, after, "Pilot.md", "Thesis/Pilot.md")).toEqual([]);
  });
});

describe("relative addresses", () => {
  it("resolves an address against the page's folder", () => {
    expect(resolveRelative("Notes", "../attachments/a%20b.png")).toBe("attachments/a b.png");
    expect(resolveRelative("", "attachments/a.png?x#y")).toBe("attachments/a.png");
    expect(resolveRelative("", "../outside.png")).toBeNull();
    expect(resolveRelative("", "https://example.com/a.png")).toBeNull();
    expect(relativeHref("Notes/Week", "attachments/my chart.png")).toBe(
      "../../attachments/my%20chart.png",
    );
    expect(relativeHref("", "attachments/a.png")).toBe("attachments/a.png");
    expect(relativeHref("attachments", "attachments/a.png")).toBe("a.png");
  });

  it("keeps a moved page's images and links pointing where they did", () => {
    const body =
      "![chart](attachments/chart.png)\n\n[guide](<attachments/Interview guide.pdf>) and [web](https://example.com) and [here](#method)\n\n`![x](attachments/x.png)`";
    expect(rebaseLinks(body, "", "Notes")).toBe(
      "![chart](../attachments/chart.png)\n\n[guide](<../attachments/Interview%20guide.pdf>) and [web](https://example.com) and [here](#method)\n\n`![x](attachments/x.png)`",
    );
    expect(rebaseLinks(rebaseLinks(body, "", "Notes"), "Notes", "")).toBe(
      body.replace("<attachments/Interview guide.pdf>", "<attachments/Interview%20guide.pdf>"),
    );
  });
});
