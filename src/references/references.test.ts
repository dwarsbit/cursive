import { describe, expect, it } from "vitest";
import { citationText, entryText, initials, sortReferences } from "./apa";
import {
  addToFence,
  citedKeys,
  emptyReference,
  matchCitation,
  pageReferences,
  readBibliography,
  sameContent,
  suggestKey,
  writeBibliography,
  type Reference,
} from "./reference";
import { zoteroReference, type ZoteroItem } from "./zotero";

const ref = (change: Partial<Reference>): Reference => ({
  ...emptyReference("x"),
  ...change,
});

const vaswani = ref({
  key: "vaswani2017",
  type: "conference",
  author: ["Vaswani, Ashish", "Shazeer, Noam", "Parmar, Niki"],
  title: "Attention is all you need",
  year: "2017",
  container: "Advances in Neural Information Processing Systems",
  pages: "5998-6008",
});

describe("APA style", () => {
  it("writes initials", () => {
    expect(initials("Ashish")).toBe("A.");
    expect(initials("Donald E.")).toBe("D. E.");
    expect(initials("Jean-Paul")).toBe("J.-P.");
  });

  it("writes a journal article", () => {
    const article = ref({
      type: "article",
      author: ["Lee, Kim", "Park, Ji-woo"],
      title: "Reading in a second language",
      year: "2020",
      container: "Journal of Reading",
      volume: "12",
      issue: "3",
      pages: "45-67",
      doi: "10.1000/jr.2020.3",
    });
    expect(entryText(article)).toBe(
      "Lee, K., & Park, J.-W. (2020). Reading in a second language. Journal of Reading, 12(3), 45–67. https://doi.org/10.1000/jr.2020.3",
    );
  });

  it("writes a book with its title in italics", () => {
    const book = ref({
      type: "book",
      author: ["Knuth, Donald E."],
      title: "The TeXbook",
      year: "1984",
      publisher: "Addison-Wesley",
    });
    expect(entryText(book)).toBe("Knuth, D. E. (1984). The TeXbook. Addison-Wesley.");
  });

  it("writes a paper in proceedings", () => {
    expect(entryText(vaswani)).toBe(
      "Vaswani, A., Shazeer, N., & Parmar, N. (2017). Attention is all you need. In Advances in Neural Information Processing Systems (pp. 5998–6008).",
    );
  });

  it("puts the title first and n.d. when there is no author or year", () => {
    expect(
      entryText(
        ref({ type: "webpage", title: "Style guide", url: "https://example.com" }),
      ),
    ).toBe("Style guide. (n.d.). https://example.com");
  });

  it("cites one, two and more authors", () => {
    const refs = new Map<string, Reference>([
      ["a", ref({ key: "a", author: ["Lee, Kim"], year: "2020" })],
      ["b", ref({ key: "b", author: ["Lee, Kim", "Park, Ji"], year: "2021" })],
      ["c", vaswani],
    ]);
    expect(
      citationText(
        [
          { key: "a", locator: "" },
          { key: "b", locator: "p. 4" },
          { key: "vaswani2017", locator: "" },
        ],
        new Map([...refs, ["vaswani2017", vaswani]]),
      ),
    ).toBe("(Lee, 2020; Lee & Park, 2021, p. 4; Vaswani et al., 2017)");
    expect(citationText([{ key: "gone", locator: "" }], refs)).toBe("(@gone)");
  });

  it("sorts the list by author, then year", () => {
    const list = sortReferences([
      vaswani,
      ref({ key: "b", author: ["Lee, Kim"], year: "2021" }),
      ref({ key: "a", author: ["Lee, Kim"], year: "2020" }),
    ]);
    expect(list.map((r) => r.key)).toEqual(["a", "b", "vaswani2017"]);
  });
});

describe("References in Markdown", () => {
  it("writes and reads a bibliography", () => {
    const linked = {
      ...vaswani,
      zotero: { library: "users/1", item: "ABCD2345", version: 7 },
    };
    const yaml = writeBibliography([linked]);
    expect(yaml).toContain("item: ABCD2345");
    expect(readBibliography(yaml)).toEqual([linked]);
  });

  it("keeps a fence that isn't a list out", () => {
    expect(readBibliography("key: value")).toBeNull();
    expect(readBibliography("- title: no key")).toEqual([]);
  });

  it("reads citations", () => {
    expect(matchCitation("[@a; @b, p. 4] more")?.items).toEqual([
      { key: "a", locator: "" },
      { key: "b", locator: "p. 4" },
    ]);
    expect(matchCitation("[@a](https://example.com)")).toBeNull();
    expect(matchCitation("[@ a]")).toBeNull();
  });

  it("finds the keys a page cites and the references it keeps", () => {
    const markdown = [
      "Text [@a] and [@b, p. 2].",
      "```js",
      "const x = '[@c]';",
      "```",
      "```bibliography",
      "- key: a",
      "  title: A",
      "```",
    ].join("\n");
    expect([...citedKeys(markdown)]).toEqual(["a", "b"]);
    expect(pageReferences(markdown).map((r) => r.key)).toEqual(["a"]);
    const added = addToFence(markdown, ref({ key: "b", title: "B" }));
    expect(pageReferences(added ?? "").map((r) => r.key)).toEqual(["a", "b"]);
    expect(addToFence("No fence.", ref({ key: "b" }))).toBeNull();
  });

  it("makes keys from the first author and the year", () => {
    expect(suggestKey(vaswani, [])).toBe("vaswani2017");
    expect(suggestKey(vaswani, ["vaswani2017"])).toBe("vaswani2017a");
    expect(suggestKey(ref({ author: ["Ødegård, Åse"], year: "2001" }), [])).toBe(
      "odegard2001",
    );
  });
});

describe("Zotero items", () => {
  const item: ZoteroItem = {
    key: "ABCD2345",
    version: 12,
    itemType: "journalArticle",
    title: "Reading in a second language",
    creators: [
      { creatorType: "author", firstName: "Kim", lastName: "Lee" },
      { creatorType: "author", name: "Reading Lab" },
    ],
    date: "March 2020",
    publicationTitle: "Journal of Reading",
    volume: "12",
    DOI: "10.1000/jr.2020.3",
  };

  it("copies an item as a reference that remembers it", () => {
    const copy = zoteroReference(item, "users/1", ["lee2020"]);
    expect(copy).toMatchObject({
      key: "lee2020a",
      type: "article",
      author: ["Lee, Kim", "Reading Lab"],
      year: "2020",
      container: "Journal of Reading",
      doi: "10.1000/jr.2020.3",
      zotero: { library: "users/1", item: "ABCD2345", version: 12 },
    });
  });

  it("sees a change in the work, not in the version alone", () => {
    const copy = zoteroReference(item, "users/1", []);
    const bumped = zoteroReference({ ...item, version: 13 }, "users/1", [], copy.key);
    expect(sameContent(copy, bumped)).toBe(true);
    const retitled = zoteroReference(
      { ...item, title: "New" },
      "users/1",
      [],
      copy.key,
    );
    expect(sameContent(copy, retitled)).toBe(false);
  });
});
