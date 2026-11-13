import { describe, expect, it } from "vitest";
import { bibName, bibtexReferences, latexText } from "./bibtex";

const FILE = String.raw`
% Exported by a reference manager
@string{jr = "Journal of Reading"}

@article{lee2020,
  author  = {Lee, Kim and Park, Ji-woo},
  title   = {Reading in a {Second} Language},
  journal = jr,
  year    = 2020,
  volume  = {12},
  number  = {3},
  pages   = {45--67},
  doi     = {https://doi.org/10.1000/jr.2020.3},
}

@book{knuth1984,
  author    = "Donald E. Knuth",
  title     = "The {\TeX}book",
  publisher = {Addison-Wesley},
  address   = {Reading, MA},
  year      = {1984}
}

@phdthesis{oedegaard2001,
  author = {{\O}deg{\aa}rd, {\AA}se},
  title  = {Sm{\aa} skoler},
  school = {Universitetet i Oslo},
  date   = {2001-05},
}

@comment{ignored, and @article{inside, title = {No}} too}

@misc{who2021,
  author = {{World Health Organization}},
  title  = {Physical activity},
  url    = {https://www.who.int/},
  year   = {2021},
}

@article{lee2020, title = {A second entry with the same key}}
`;

describe("BibTeX files", () => {
  it("reads LaTeX as plain text", () => {
    expect(
      latexText(String.raw`G{\"o}del, \'Ecole and Fran\c{c}ois -- \emph{fine}`),
    ).toBe("Gödel, École and François – fine");
    expect(latexText(String.raw`{\ss} \& 50\%`)).toBe("ß & 50%");
  });

  it("reads names", () => {
    expect(bibName("Donald E. Knuth")).toBe("Knuth, Donald E.");
    expect(bibName("Ludwig van Beethoven")).toBe("van Beethoven, Ludwig");
    expect(bibName("Lee, Kim")).toBe("Lee, Kim");
    expect(bibName("{World Health Organization}")).toBe("World Health Organization");
  });

  it("reads the entries of a file", () => {
    const refs = bibtexReferences(FILE);
    expect(refs.map((ref) => ref.key)).toEqual([
      "lee2020",
      "knuth1984",
      "oedegaard2001",
      "who2021",
    ]);
    expect(refs[0]).toMatchObject({
      type: "article",
      author: ["Lee, Kim", "Park, Ji-woo"],
      title: "Reading in a Second Language",
      container: "Journal of Reading",
      year: "2020",
      issue: "3",
      pages: "45-67",
      doi: "10.1000/jr.2020.3",
      zotero: null,
    });
    expect(refs[1]).toMatchObject({
      type: "book",
      author: ["Knuth, Donald E."],
      title: "The TeXbook",
      place: "Reading, MA",
    });
    expect(refs[2]).toMatchObject({
      type: "thesis",
      author: ["Ødegård, Åse"],
      title: "Små skoler",
      publisher: "Universitetet i Oslo",
      genre: "Doctoral dissertation",
      year: "2001",
    });
    expect(refs[3]).toMatchObject({
      type: "webpage",
      author: ["World Health Organization"],
    });
  });
});
