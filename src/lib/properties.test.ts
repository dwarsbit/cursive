import { describe, expect, it } from "vitest";
import {
  formatProperties,
  normalizeLink,
  parseProperties,
  propertyKey,
  propertyLabel,
} from "./properties";

describe("parseProperties", () => {
  it("reads text and lists", () => {
    expect(
      parseProperties(
        "tags: [methods, survey, chapter 3]\nstatus: In progress\npilot-date: 2026-11-18",
      ),
    ).toEqual([
      { kind: "list", key: "tags", value: ["methods", "survey", "chapter 3"] },
      { kind: "text", key: "status", value: "In progress" },
      { kind: "date", key: "pilot-date", value: "2026-11-18" },
    ]);
  });

  it("reads dates, numbers, links and true or false", () => {
    expect(
      parseProperties(
        "due: 2026-12-01\npages: 12\nweight: 0.5\nsource: https://example.org/a?b=1\ndone: true\ndraft: False",
      ),
    ).toEqual([
      { kind: "date", key: "due", value: "2026-12-01" },
      { kind: "number", key: "pages", value: "12" },
      { kind: "number", key: "weight", value: "0.5" },
      { kind: "link", key: "source", value: "https://example.org/a?b=1" },
      { kind: "boolean", key: "done", value: true },
      { kind: "boolean", key: "draft", value: false },
    ]);
  });

  it("reads quoted values as text, whatever they look like", () => {
    expect(parseProperties('year: "2026"\nflag: "true"')).toEqual([
      { kind: "text", key: "year", value: "2026" },
      { kind: "text", key: "flag", value: "true" },
    ]);
  });

  it("reads quoted values and an empty value", () => {
    expect(parseProperties('note: "a: b"\ntags: ["x, y", z]\nempty:')).toEqual([
      { kind: "text", key: "note", value: "a: b" },
      { kind: "list", key: "tags", value: ["x, y", "z"] },
      { kind: "text", key: "empty", value: "" },
    ]);
  });

  it("keeps what it doesn't understand as written", () => {
    const raw =
      "authors:\n  - Leon\n  - Maya\nlayout: {a: 1}\n# a comment\nstatus: Draft";
    const properties = parseProperties(raw);
    expect(properties.filter((p) => p.kind !== "raw")).toEqual([
      { kind: "text", key: "status", value: "Draft" },
    ]);
    expect(formatProperties(properties)).toBe(raw);
  });

  it("reads nothing from an empty front matter", () => {
    expect(parseProperties("")).toEqual([]);
  });
});

describe("formatProperties", () => {
  for (const raw of [
    "tags: [methods, survey]\nstatus: In progress",
    'note: "a: b"',
    'tags: ["x, y", z]',
    "empty:",
    'flag: "true"',
    "due: 2026-12-01\npages: 12\nsource: https://example.org\ndone: false",
    'year: "2026"',
  ]) {
    it(`writes ${JSON.stringify(raw)} back the same`, () => {
      expect(formatProperties(parseProperties(raw))).toBe(raw);
    });
  }
});

describe("formatProperties with kinds", () => {
  it("quotes text that would read as another kind", () => {
    expect(
      formatProperties([
        { kind: "text", key: "year", value: "2026" },
        { kind: "text", key: "site", value: "https://example.org" },
      ]),
    ).toBe('year: "2026"\nsite: "https://example.org"');
  });

  it("writes a value that doesn't fit its kind as text", () => {
    expect(formatProperties([{ kind: "number", key: "pages", value: "a few" }])).toBe(
      "pages: a few",
    );
    expect(formatProperties([{ kind: "boolean", key: "done", value: true }])).toBe(
      "done: true",
    );
  });

  it("adds https:// to a link without a scheme", () => {
    expect(normalizeLink("example.org")).toBe("https://example.org");
    expect(normalizeLink("mailto:a@b.org")).toBe("mailto:a@b.org");
    expect(normalizeLink("")).toBe("");
  });
});

describe("property names", () => {
  it("shows a key as a label and writes a label as a key", () => {
    expect(propertyLabel("pilot-date")).toBe("Pilot date");
    expect(propertyKey("Pilot date")).toBe("pilot-date");
    expect(propertyKey("  Due (week) ")).toBe("due-week");
  });
});
