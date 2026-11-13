import { describe, expect, it } from "vitest";
import { findLinks, linkIndex } from "@/lib/links";
import { readPage } from "@/lib/page-file";
import { citedKeys, pageReferences } from "@/references/reference";
import { isPresentation, readDeck } from "@/slides/deck";
import { readAssignment, readQuiz } from "@/tutorial/blocks";
import { TEMPLATES, templatePages } from "./index";

const fences = (markdown: string, name: string) =>
  [
    ...markdown.matchAll(new RegExp(`^\`\`\`${name}\\n([\\s\\S]*?)\\n\`\`\`$`, "gm")),
  ].map((match) => match[1]);

describe("project templates", () => {
  it("each have a name, a description and pages", () => {
    expect(new Set(TEMPLATES.map((template) => template.id)).size).toBe(
      TEMPLATES.length,
    );
    for (const template of TEMPLATES) {
      expect(template.description).toMatch(/\.$/);
      expect(Object.keys(templatePages(template.id)).length).toBeGreaterThan(0);
    }
  });

  it("name each page's file after its title", () => {
    for (const template of TEMPLATES) {
      for (const [path, source] of Object.entries(templatePages(template.id))) {
        expect(path.split("/").pop()).toBe(`${readPage(source).title}.md`);
      }
    }
  });

  it("link only to pages they hold, and cite only works they keep", () => {
    for (const template of TEMPLATES) {
      const pages = templatePages(template.id);
      const index = linkIndex(pages);
      for (const [path, source] of Object.entries(pages)) {
        for (const link of findLinks(source)) {
          expect(
            index.resolve(link.target),
            `${path}: [[${link.target}]]`,
          ).toBeTruthy();
        }
        const kept = pageReferences(source).map((reference) => reference.key);
        for (const key of citedKeys(source)) {
          expect(kept, `${path}: @${key}`).toContain(key);
        }
      }
    }
  });

  it("fill in the day the project is made", () => {
    const pages = templatePages("lecture-notes", new Date(2026, 10, 13));
    expect(pages["Lectures/Lecture 1.md"]).toContain("date: 2026-11-13");
    for (const template of TEMPLATES) {
      expect(Object.values(templatePages(template.id)).join("\n")).not.toContain("{{");
    }
  });

  it("hold what their kind is for", () => {
    for (const template of TEMPLATES) {
      const pages = Object.values(templatePages(template.id));
      if (template.kind === "presentation") {
        const deck = pages.map(readPage).find(isPresentation);
        expect(readDeck(deck?.markdown ?? "").length, template.id).toBeGreaterThan(5);
      }
      if (template.kind === "tutorial") {
        const all = pages.join("\n");
        const quizzes = fences(all, "quiz").map(readQuiz);
        expect(quizzes.length).toBeGreaterThan(0);
        for (const quiz of quizzes) expect(quiz?.answer).toEqual([1]);
        const [assignment] = fences(all, "assignment").map(readAssignment);
        expect(assignment?.points).toBe(10);
        expect(assignment?.files).toBe(true);
      }
    }
  });
});
