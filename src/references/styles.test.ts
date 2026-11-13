import { describe, expect, it } from "vitest";
import { emptyReference, type Reference } from "./reference";
import {
  entryPlain,
  listOrder,
  numberWorks,
  styleById,
  styleOfProperties,
} from "./styles";

const ref = (change: Partial<Reference>): Reference => ({
  ...emptyReference("x"),
  ...change,
});

const lee = ref({
  key: "lee2020",
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
const knuth = ref({
  key: "knuth1984",
  type: "book",
  author: ["Knuth, Donald E."],
  title: "The TeXbook",
  year: "1984",
  publisher: "Addison-Wesley",
  place: "Reading, MA",
});
const smith = ref({
  key: "smith2019",
  type: "chapter",
  author: ["Smith, Jane"],
  editor: ["Brown, Al", "Green, Bo"],
  title: "Survey fatigue",
  year: "2019",
  container: "Handbook of Surveys",
  publisher: "Sage",
  place: "London",
  pages: "10-20",
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
const refs = new Map([lee, knuth, smith, vaswani].map((r) => [r.key, r]));
const cite = (id: string, ...items: Array<[string, string?]>) => {
  const style = styleById(id);
  const list = [...refs.values()];
  return style.citation(
    items.map(([key, locator = ""]) => ({ key, locator })),
    refs,
    numberWorks(["vaswani2017", "lee2020"], list),
  );
};

describe("citation styles", () => {
  it("writes Chicago author-date", () => {
    const style = styleById("chicago-author-date");
    expect(entryPlain(style, lee)).toBe(
      "Lee, Kim, and Ji-woo Park. 2020. “Reading in a second language.” Journal of Reading 12 (3): 45–67. https://doi.org/10.1000/jr.2020.3.",
    );
    expect(entryPlain(style, knuth)).toBe(
      "Knuth, Donald E. 1984. The TeXbook. Reading, MA: Addison-Wesley.",
    );
    expect(entryPlain(style, smith)).toBe(
      "Smith, Jane. 2019. “Survey fatigue.” In Handbook of Surveys, edited by Al Brown and Bo Green, 10–20. London: Sage.",
    );
    expect(cite("chicago-author-date", ["vaswani2017", "p. 4"], ["lee2020"])).toBe(
      "(Vaswani, Shazeer, and Parmar 2017, 4; Lee and Park 2020)",
    );
  });

  it("writes MLA", () => {
    const style = styleById("modern-language-association");
    expect(entryPlain(style, lee)).toBe(
      "Lee, Kim, and Ji-woo Park. “Reading in a second language.” Journal of Reading, vol. 12, no. 3, 2020, pp. 45–67, https://doi.org/10.1000/jr.2020.3.",
    );
    expect(entryPlain(style, vaswani)).toBe(
      "Vaswani, Ashish, et al. “Attention is all you need.” Advances in Neural Information Processing Systems, 2017, pp. 5998–6008.",
    );
    expect(cite("modern-language-association", ["vaswani2017", "p. 4"])).toBe(
      "(Vaswani et al. 4)",
    );
  });

  it("writes IEEE, numbered in the order works are first cited", () => {
    const style = styleById("ieee");
    expect(entryPlain(style, lee)).toBe(
      "K. Lee and J.-W. Park, “Reading in a second language,” Journal of Reading, vol. 12, no. 3, pp. 45–67, 2020. doi: 10.1000/jr.2020.3.",
    );
    expect(entryPlain(style, knuth)).toBe(
      "D. E. Knuth, The TeXbook. Reading, MA: Addison-Wesley, 1984.",
    );
    expect(cite("ieee", ["vaswani2017", "p. 4"], ["lee2020"])).toBe("[1, p. 4], [2]");
  });

  it("writes Harvard", () => {
    const style = styleById("harvard-cite-them-right");
    expect(entryPlain(style, lee)).toBe(
      "Lee, K. and Park, J.-W. (2020) ‘Reading in a second language’, Journal of Reading, 12(3), pp. 45–67. Available at: https://doi.org/10.1000/jr.2020.3.",
    );
    expect(entryPlain(style, knuth)).toBe(
      "Knuth, D.E. (1984) The TeXbook. Reading, MA: Addison-Wesley.",
    );
    expect(cite("harvard-cite-them-right", ["lee2020", "p. 50"])).toBe(
      "(Lee and Park, 2020, p. 50)",
    );
  });

  it("writes Vancouver", () => {
    const style = styleById("vancouver");
    expect(entryPlain(style, lee)).toBe(
      "Lee K, Park JW. Reading in a second language. Journal of Reading. 2020;12(3):45–67. doi:10.1000/jr.2020.3",
    );
    expect(entryPlain(style, smith)).toBe(
      "Smith J. Survey fatigue. In: Brown A, Green B, editors. Handbook of Surveys. London: Sage; 2019. p. 10–20.",
    );
    expect(cite("vancouver", ["vaswani2017"], ["lee2020"])).toBe("(1, 2)");
  });

  it("reads the style from the front matter, by its CSL name", () => {
    expect(styleOfProperties("tags: [a]\ncsl: ieee").id).toBe("ieee");
    expect(styleOfProperties('csl: "styles/vancouver.csl"').id).toBe("vancouver");
    expect(styleOfProperties("csl: mla").id).toBe("modern-language-association");
    expect(styleOfProperties("csl: nature").id).toBe("apa");
    expect(styleOfProperties("").id).toBe("apa");
  });

  it("lists numbered works in citation order, the uncited ones last", () => {
    const list = [...refs.values()];
    const numbers = numberWorks(["vaswani2017", "lee2020"], list);
    expect(listOrder(styleById("ieee"), list, numbers).map((r) => r.key)).toEqual([
      "vaswani2017",
      "lee2020",
      "knuth1984",
      "smith2019",
    ]);
    expect(listOrder(styleById("apa"), list, numbers).map((r) => r.key)).toEqual([
      "knuth1984",
      "lee2020",
      "smith2019",
      "vaswani2017",
    ]);
  });
});
