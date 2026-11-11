import { describe, expect, it } from "vitest";
import {
  formatProperties,
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
      { kind: "text", key: "pilot-date", value: "2026-11-18" },
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
  ]) {
    it(`writes ${JSON.stringify(raw)} back the same`, () => {
      expect(formatProperties(parseProperties(raw))).toBe(raw);
    });
  }
});

describe("property names", () => {
  it("shows a key as a label and writes a label as a key", () => {
    expect(propertyLabel("pilot-date")).toBe("Pilot date");
    expect(propertyKey("Pilot date")).toBe("pilot-date");
    expect(propertyKey("  Due (week) ")).toBe("due-week");
  });
});
