import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";

/**
 * Finds the `</details>` that closes the `<details>` at the start of
 * `src`, counting nested toggles. Returns the index just past it.
 */
function closingIndex(src: string): number {
  const tag = /<details(?: open)?>|<\/details>/g;
  let depth = 0;
  for (let m = tag.exec(src); m; m = tag.exec(src)) {
    depth += m[0] === "</details>" ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/**
 * A toggle: a line that opens and closes the blocks under it. In
 * Markdown it is a `<details>` element, which other tools show the
 * same way.
 */
export const Toggle = Details.extend({
  markdownTokenizer: {
    name: "details",
    level: "block",
    start: (src) => src.search(/^<details(?: open)?>/m),
    tokenize(src, _tokens, lexer) {
      const open = /^<details( open)?>\s*<summary>([\s\S]*?)<\/summary>/.exec(src);
      if (!open) return undefined;
      const end = closingIndex(src);
      if (end < 0) return undefined;
      const body = src.slice(open[0].length, end - "</details>".length).trim();
      const trailing = /^[ \t]*(?:\n|$)/.exec(src.slice(end))?.[0] ?? "";
      return {
        type: "details",
        raw: src.slice(0, end) + trailing,
        open: Boolean(open[1]),
        summary: lexer.inlineTokens(open[2].trim()),
        tokens: lexer.blockTokens(body),
      };
    },
  },

  parseMarkdown(token, helpers) {
    const content = helpers.parseChildren(token.tokens ?? []);
    return helpers.createNode("details", { open: token.open }, [
      helpers.createNode(
        "detailsSummary",
        {},
        helpers.parseInline(token.summary ?? []),
      ),
      helpers.createNode(
        "detailsContent",
        {},
        content.length ? content : [helpers.createNode("paragraph")],
      ),
    ]);
  },

  renderMarkdown(node, helpers) {
    const [summary, content] = node.content ?? [];
    const title = summary ? helpers.renderChildren(summary.content ?? []) : "";
    const body = content ? helpers.renderChildren(content.content ?? [], "\n\n") : "";
    const open = node.attrs?.open ? " open" : "";
    return `<details${open}>\n<summary>${title}</summary>\n\n${body}\n\n</details>`;
  },
});

export { DetailsContent as ToggleContent, DetailsSummary as ToggleSummary };
