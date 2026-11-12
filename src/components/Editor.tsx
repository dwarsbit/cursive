import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import { Placeholder } from "@tiptap/extensions";
import type { Node as ProseNode } from "@tiptap/pm/model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { GripVertical, Plus } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { documentExtensions, lowlight } from "@/editor/extensions";
import { createSlashController, Slash } from "@/editor/slash";
import { tidyMarkdown } from "@/lib/page-file";
import { CodeBlockView } from "./CodeBlockView";
import { MathPopover, type MathTarget } from "./MathPopover";
import { SelectionToolbar } from "./SelectionToolbar";
import { SlashMenu } from "./SlashMenu";

export interface EditorChange {
  markdown: string;
}

/** The visual face of a page: blocks you edit in place. */
export function Editor({
  markdown,
  onChange,
  focusRef,
  editorRef,
  inSlide = false,
}: {
  /** The page when the editor opens; later edits live in the editor. */
  markdown: string;
  onChange: (change: EditorChange) => void;
  /** Filled with a function that puts the caret at the start of the page. */
  focusRef?: React.RefObject<(() => void) | null>;
  /** Filled with the editor, for whoever works on its blocks from outside. */
  editorRef?: React.RefObject<TiptapEditor | null>;
  /**
   * The page is a slide: it is drawn scaled, so its menus hang from
   * the window and not from the page, and blocks have no handle.
   */
  inSlide?: boolean;
}) {
  const [math, setMath] = useState<MathTarget | null>(null);
  const [controller] = useState(createSlashController);
  const slash = useSyncExternalStore(controller.subscribe, controller.getState);
  const hovered = useRef<{ node: ProseNode; pos: number } | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const [extensions] = useState(() => [
    ...documentExtensions({
      codeBlock: CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      }).configure({ lowlight }),
      mathematics: BlockMath.configure({
        katexOptions: { throwOnError: false, displayMode: true },
        onClick: (_node, pos) => setMath({ pos, kind: "blockMath" }),
      }),
    }),
    InlineMath.configure({
      katexOptions: { throwOnError: false },
      onClick: (_node, pos) => setMath({ pos, kind: "inlineMath" }),
    }),
    Placeholder.configure({
      placeholder: ({ node }) => {
        if (node.type.name === "heading") return `Heading ${node.attrs.level}`;
        if (node.type.name === "detailsSummary") return "Toggle";
        if (node.type.name === "paragraph") return "Type / for commands";
        return "";
      },
      showOnlyCurrent: true,
      includeChildren: true,
    }),
    Slash.configure(controller.options),
  ]);

  const editor = useEditor({
    extensions,
    content: markdown,
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: "doc",
        "aria-label": inSlide ? "Slide" : "Page",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: e, transaction }) => {
      onChangeRef.current({ markdown: tidyMarkdown(e.getMarkdown()) });
      // A new equation is empty: open its field right away.
      if (!transaction.docChanged) return;
      e.state.doc.descendants((node, pos) => {
        if (node.type.name === "blockMath" && !node.attrs.latex) {
          setMath((open) => open ?? { pos, kind: "blockMath" });
        }
        return !node.isTextblock;
      });
    },
  });

  useEffect(() => {
    if (focusRef) focusRef.current = () => editor.commands.focus("start");
    if (editorRef) editorRef.current = editor;
  }, [editor, focusRef, editorRef]);

  /** The + on a block: a new line under it with the slash menu open. */
  const addBelow = () => {
    const target = hovered.current;
    if (!target) return;
    const at = target.pos + target.node.nodeSize;
    const empty =
      target.node.type.name === "paragraph" && target.node.content.size === 0;
    if (empty) {
      editor
        .chain()
        .focus(target.pos + 1)
        .insertContent("/")
        .run();
      return;
    }
    editor
      .chain()
      .insertContentAt(at, { type: "paragraph" })
      .focus(at + 1)
      .insertContent("/")
      .run();
  };

  const menus = (
    <>
      {slash && <SlashMenu state={slash} controller={controller} />}
      {math && (
        <MathPopover
          key={`${math.kind}:${math.pos}`}
          editor={editor}
          target={math}
          onClose={() => setMath(null)}
        />
      )}
    </>
  );

  if (inSlide) {
    return (
      <>
        <EditorContent editor={editor} />
        <SelectionToolbar editor={editor} appendTo={() => document.body} />
        {createPortal(menus, document.body)}
      </>
    );
  }

  return (
    <>
      <DragHandle
        editor={editor}
        className="block-handle"
        onNodeChange={({ node, pos }) => {
          hovered.current = node ? { node, pos } : null;
        }}
      >
        <button
          type="button"
          aria-label="Add block below"
          title="Add block below"
          onClick={addBelow}
        >
          <Plus aria-hidden />
        </button>
        <span
          className="grip"
          role="img"
          aria-label="Drag to move"
          title="Drag to move"
        >
          <GripVertical aria-hidden />
        </span>
      </DragHandle>
      <EditorContent editor={editor} />
      <SelectionToolbar editor={editor} />
      {menus}
    </>
  );
}
