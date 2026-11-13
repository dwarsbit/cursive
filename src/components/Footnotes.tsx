import type { Editor, JSONContent } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import katex from "katex";
import { useMemo, type ReactNode } from "react";
import { writeFootnote } from "@/editor/footnote";
import { citationText } from "@/references/apa";
import { usePageReferences } from "@/references/context";
import type { CiteItem, Reference } from "@/references/reference";

const WRAP: Record<string, (children: ReactNode, key: number) => ReactNode> = {
  bold: (children, key) => <strong key={key}>{children}</strong>,
  italic: (children, key) => <em key={key}>{children}</em>,
  underline: (children, key) => <u key={key}>{children}</u>,
  strike: (children, key) => <s key={key}>{children}</s>,
  code: (children, key) => <code key={key}>{children}</code>,
  highlight: (children, key) => <mark key={key}>{children}</mark>,
};

/** A note's inline content as the page shows it. */
function inline(nodes: JSONContent[], refs: Map<string, Reference>): ReactNode[] {
  return nodes.map((node, key) => {
    if (node.type === "citation") {
      return (
        <span key={key} className="citation">
          {citationText((node.attrs?.items as CiteItem[] | undefined) ?? [], refs)}
        </span>
      );
    }
    if (node.type === "inlineMath") {
      const html = katex.renderToString(String(node.attrs?.latex ?? ""), {
        throwOnError: false,
      });
      return <span key={key} dangerouslySetInnerHTML={{ __html: html }} />;
    }
    if (node.type === "footnote") {
      return writeFootnote(String(node.attrs?.text ?? ""));
    }
    if (node.type !== "text") {
      return node.content ? inline(node.content, refs) : " ";
    }
    let out: ReactNode = node.text ?? "";
    for (const mark of node.marks ?? []) {
      if (mark.type === "link") {
        out = (
          <a
            key={key}
            href={String(mark.attrs?.href ?? "")}
            target="_blank"
            rel="noreferrer"
          >
            {out}
          </a>
        );
      } else {
        out = WRAP[mark.type]?.(out, key) ?? out;
      }
    }
    return <span key={key}>{out}</span>;
  });
}

/** A footnote's text, read as inline Markdown. */
export function NoteText({ editor, text }: { editor: Editor; text: string }) {
  const { refs } = usePageReferences();
  const content = useMemo(() => {
    try {
      return (editor.markdown?.parse(text).content ?? []).flatMap(
        (block) => block.content ?? [],
      );
    } catch {
      return [{ type: "text", text }];
    }
  }, [editor, text]);
  return inline(content, refs);
}

interface Note {
  pos: number;
  text: string;
}

/**
 * The page's footnotes under its blocks, in the order the text has
 * them. The list is drawn from the text and is not a block. Where the
 * page is edited, a click on a note opens its field.
 */
export function Footnotes({
  editor,
  onOpen,
}: {
  editor: Editor;
  onOpen?: (pos: number) => void;
}) {
  const notes = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const found: Note[] = [];
      e.state.doc.descendants((node, pos) => {
        if (node.type.name === "footnote") {
          found.push({ pos, text: node.attrs.text as string });
        }
      });
      return found;
    },
  });
  if (!notes.length) return null;
  return (
    <ol className="footnotes" aria-label="Footnotes">
      {notes.map((note, index) => (
        <li
          key={index}
          className={onOpen ? "footnote-open" : undefined}
          title={onOpen ? "Edit footnote" : undefined}
          onClick={onOpen ? () => onOpen(note.pos) : undefined}
        >
          <NoteText editor={editor} text={note.text} />
        </li>
      ))}
    </ol>
  );
}
