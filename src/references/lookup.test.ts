import { describe, expect, it } from "vitest";
import { mayHold } from "./context";
import { crossrefReference, lookupOf, openLibraryReference } from "./lookup";
import { librariesOf } from "./zotero";

describe("Looking works up", () => {
  it("tells a DOI and an ISBN from other words", () => {
    expect(lookupOf("10.1038/nature14539")).toEqual({
      kind: "doi",
      id: "10.1038/nature14539",
    });
    expect(lookupOf("https://doi.org/10.1000/jr.2020.3.")).toEqual({
      kind: "doi",
      id: "10.1000/jr.2020.3",
    });
    expect(lookupOf("978-0-201-13447-6")).toEqual({
      kind: "isbn",
      id: "9780201134476",
    });
    expect(lookupOf("0-201-13447-0")).toEqual({ kind: "isbn", id: "0201134470" });
    expect(lookupOf("978-0-201-13447-7")).toBeNull();
    expect(lookupOf("vaswani")).toBeNull();
  });

  it("reads a work from Crossref", () => {
    const ref = crossrefReference(
      {
        type: "journal-article",
        title: ["Deep <i>learning</i>"],
        author: [
          { family: "LeCun", given: "Yann" },
          { family: "Bengio", given: "Yoshua" },
        ],
        issued: { "date-parts": [[2015, 5, 27]] },
        "container-title": ["Nature"],
        volume: "521",
        issue: "7553",
        page: "436-444",
        DOI: "10.1038/nature14539",
      },
      [],
    );
    expect(ref).toMatchObject({
      key: "lecun2015",
      type: "article",
      author: ["LeCun, Yann", "Bengio, Yoshua"],
      title: "Deep learning",
      year: "2015",
      container: "Nature",
      pages: "436-444",
      doi: "10.1038/nature14539",
    });
  });

  it("reads a book from Open Library", () => {
    const ref = openLibraryReference(
      {
        title: "The TeXbook",
        authors: [{ name: "Donald E. Knuth" }],
        publishers: [{ name: "Addison-Wesley" }],
        publish_date: "1984",
      },
      ["knuth1984"],
    );
    expect(ref).toMatchObject({
      key: "knuth1984a",
      type: "book",
      author: ["Knuth, Donald E."],
      publisher: "Addison-Wesley",
      year: "1984",
    });
  });
});

describe("Zotero group libraries", () => {
  it("searches the groups that are on", () => {
    const libraries = librariesOf({
      id: "s",
      kind: "cloud",
      enabled: true,
      label: "",
      userId: "12",
      apiKey: "k",
      groups: [
        { id: "7", name: "Lab", enabled: true },
        { id: "8", name: "Course", enabled: false },
      ],
    });
    expect(
      libraries.map((library) => [library.path, library.id, library.group]),
    ).toEqual([
      ["users/12", "users/12", ""],
      ["groups/7", "groups/7", "Lab"],
    ]);
  });

  it("looks for a copied item in its own library", () => {
    expect(mayHold("local", "users/12")).toBe(true);
    expect(mayHold("users/12", "local")).toBe(true);
    expect(mayHold("groups/7", "groups/7")).toBe(true);
    expect(mayHold("local", "groups/7")).toBe(false);
    expect(mayHold("users/12", "groups/7")).toBe(false);
  });
});
