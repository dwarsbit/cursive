import { computePosition, flip, offset, shift } from "@floating-ui/dom";
import { Extension, Node, type AnyExtension, type Editor } from "@tiptap/core";
import { Highlight } from "@tiptap/extension-highlight";
import { Mathematics } from "@tiptap/extension-mathematics";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Cite, createCiteController } from "../editor/cite";
import { ReferencesElsewhere, usePageReferences } from "../references/context";
import { Citation } from "../references/nodes";
import type { Reference } from "../references/reference";
import { addReference, CiteMenu } from "./CiteMenu";
import { CitationView } from "./ReferenceViews";

/** A note is one paragraph. */
const NoteDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "paragraph",
  renderMarkdown: (node, helpers) =>
    node.content ? helpers.renderChildren(node.content, " ") : "",
});

const noteText = (editor: Editor): string =>
  editor.isEmpty
    ? ""
    : editor
        .getMarkdown()
        .replace(/\s*\n\s*/g, " ")
        .trim();

/**
 * A small field under a footnote to write its note, with the text
 * formatting of a paragraph. Typing `@` cites a work, as on the page.
 */
export function FootnotePopover({
  editor,
  pos,
  onClose,
}: {
  editor: Editor;
  pos: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [citer] = useState(createCiteController);
  const cite = useSyncExternalStore(citer.subscribe, citer.getState);
  const { addElsewhere } = usePageReferences();
  const [initial] = useState(
    () => (editor.state.doc.nodeAt(pos)?.attrs.text as string | undefined) ?? "",
  );
  const [text, setText] = useState(initial);

  /**
   * Closes the field. Enter goes on writing after the footnote, Escape
   * leaves it selected, and a click elsewhere keeps the caret there.
   */
  const finish = (how: "enter" | "escape" | "outside") => {
    onClose();
    const current = editor.state.doc.nodeAt(pos);
    if (current?.type.name !== "footnote") return;
    const end = pos + current.nodeSize;
    if (!(current.attrs.text as string).trim()) {
      // A footnote left empty is removed again.
      editor.commands.deleteRange({ from: pos, to: end });
    } else if (how === "escape") {
      editor.commands.setNodeSelection(pos);
    } else if (how === "enter") {
      editor.commands.setTextSelection(end);
    }
    // The page takes the keys again at once, so nothing typed is lost.
    if (how !== "outside") editor.view.focus();
  };
  // The field's keys are set up once; they close it as it is now.
  const latest = useRef(finish);
  useEffect(() => {
    latest.current = finish;
  });
  const onFinish = (how: "enter" | "escape" | "outside") => latest.current(how);

  const [extensions] = useState((): AnyExtension[] => [
    NoteDocument,
    StarterKit.configure({
      document: false,
      heading: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      codeBlock: false,
      horizontalRule: false,
      hardBreak: false,
      dropcursor: false,
      gapcursor: false,
      trailingNode: false,
      link: { openOnClick: false, autolink: true },
    }),
    Highlight,
    Mathematics,
    Citation.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CitationView);
      },
    }),
    Markdown,
    Placeholder.configure({ placeholder: "Footnote" }),
    Cite.configure(citer.options),
    // After the citation menu, which takes these keys while it is open.
    Extension.create({
      name: "noteKeys",
      priority: 50,
      addKeyboardShortcuts() {
        return {
          Enter: () => {
            onFinish("enter");
            return true;
          },
          Escape: () => {
            onFinish("escape");
            return true;
          },
        };
      },
    }),
  ]);

  const field = useEditor({
    extensions,
    content: initial,
    contentType: "markdown",
    editorProps: {
      attributes: { class: "doc footnote-field", "aria-label": "Footnote" },
    },
    onUpdate: ({ editor: e }) => {
      const next = noteText(e);
      setText(next);
      editor
        .chain()
        .command(({ tr }) => {
          const current = tr.doc.nodeAt(pos);
          if (current?.type.name !== "footnote") return false;
          tr.setNodeMarkup(pos, undefined, { ...current.attrs, text: next });
          return true;
        })
        .run();
    },
  });

  useLayoutEffect(() => {
    const popover = ref.current;
    const anchor = editor.view.nodeDOM(pos);
    if (!popover || !(anchor instanceof HTMLElement)) return;
    void computePosition(anchor, popover, {
      placement: "bottom",
      strategy: "fixed",
      middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      popover.style.left = `${x}px`;
      popover.style.top = `${y}px`;
      popover.style.opacity = "1";
    });
  }, [editor, pos, text]);

  // The page takes the focus back a frame after a footnote is added,
  // so the field asks for it after that.
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => field.commands.focus("end"));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [field]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest?.("[data-footnote-field]")) latest.current("outside");
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  // A work cited in the note joins the page's references, not the note.
  const add = useCallback(
    (work: Reference) => addReference(editor, work, addElsewhere),
    [editor, addElsewhere],
  );

  return (
    <ReferencesElsewhere add={add}>
      <div
        ref={ref}
        data-footnote-field
        role="dialog"
        aria-label="Footnote"
        className="popover fixed z-30 w-[min(24rem,calc(100vw-1rem))] p-2"
        // Transparent until it is placed; a hidden field could not take the focus.
        style={{ opacity: 0 }}
      >
        <EditorContent editor={field} />
        <p className="px-1 pt-1.5 text-2xs text-muted-foreground">
          Enter to finish. Type @ to cite a work.
        </p>
      </div>
      {cite && (
        <div data-footnote-field className="contents">
          <CiteMenu state={cite} controller={citer} />
        </div>
      )}
    </ReferencesElsewhere>
  );
}
