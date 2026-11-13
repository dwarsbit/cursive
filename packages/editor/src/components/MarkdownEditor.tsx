import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { yamlFrontmatter } from "@codemirror/lang-yaml";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { drawSelection, EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import { offerFindTarget } from "../lib/find";
import { codeMirrorFindTarget, findField } from "../lib/find-codemirror";

// The words stay in the text color and the syntax around them is
// muted, so the source reads like the page.
const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.monospace, color: "var(--destructive)" },
  { tag: tags.link, textDecoration: "underline" },
  {
    tag: [
      tags.processingInstruction,
      tags.meta,
      tags.url,
      tags.contentSeparator,
      tags.labelName,
    ],
    color: "var(--muted-foreground)",
  },
  {
    tag: [tags.quote],
    color: "color-mix(in srgb, var(--foreground) 80%, var(--muted-foreground))",
  },
  {
    tag: [tags.keyword, tags.atom, tags.bool, tags.propertyName],
    color: "var(--syn-kw)",
  },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--syn-str)" },
  { tag: [tags.number], color: "var(--syn-num)" },
  { tag: [tags.comment], color: "var(--muted-foreground)", fontStyle: "italic" },
]);

const theme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "13.5px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.75",
    overflow: "visible",
  },
  ".cm-content": { padding: "0", caretColor: "var(--foreground)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
    { backgroundColor: "var(--selection)" },
});

/** The Markdown face of a page: the file as text. */
export function MarkdownEditor({
  source,
  onChange,
}: {
  /** The file when the editor opens; later edits live in the editor. */
  source: string;
  onChange: (source: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const initial = useRef(source);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: initial.current,
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          // The front matter is read as YAML, the rest as Markdown.
          yamlFrontmatter({ content: markdown({ base: markdownLanguage }) }),
          syntaxHighlighting(highlight),
          theme,
          findField,
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.contentAttributes.of({
            "aria-label": "Page as Markdown",
            spellcheck: "true",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.focus();
    const withdraw = offerFindTarget(codeMirrorFindTarget(view));
    return () => {
      withdraw();
      view.destroy();
    };
  }, []);

  return <div ref={host} className="source" />;
}
