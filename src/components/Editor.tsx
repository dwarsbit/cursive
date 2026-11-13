import type { AnyExtension, Node as TiptapNode } from "@tiptap/core";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import { Placeholder } from "@tiptap/extensions";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { NodeSelection, Selection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor as TiptapEditor } from "@tiptap/core";
import {
  EditorContent,
  ReactNodeViewRenderer,
  useEditor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { GripVertical, Plus } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { documentExtensions, lowlight } from "@/editor/extensions";
import { Footnote, inlineNumberedNotes } from "@/editor/footnote";
import { Cite, createCiteController } from "@/editor/cite";
import { Find, findTargetFor } from "@/editor/find";
import { createFileDropController, FileDrop, insertFiles } from "@/editor/media";
import { offerFindTarget } from "@/lib/find";
import { createLinkMenuController, PageLinkMenu } from "@/editor/page-link";
import { relativeHref } from "@/lib/links";
import { parentOf } from "@/lib/project";
import { useWorkspace } from "@/lib/workspace";
import { createSlashController, Slash } from "@/editor/slash";
import { tidyMarkdown } from "@/lib/page-file";
import { scrollNearEdge, startPointerDrag } from "@/lib/pointer-drag";
import type { TutorialKind } from "@/tutorial/blocks";
import { CiteMenu } from "./CiteMenu";
import { CodeBlockView } from "./CodeBlockView";
import { FootnotePopover } from "./FootnotePopover";
import { Footnotes } from "./Footnotes";
import { MathPopover, type MathTarget } from "./MathPopover";
import { withPageViews } from "./MediaViews";
import { LinkMenu } from "./PageLinks";
import { BibliographyView, CitationView } from "./ReferenceViews";
import { SelectionToolbar } from "./SelectionToolbar";
import { SlashMenu } from "./SlashMenu";
import {
  BlanksView,
  CompareView,
  ExerciseView,
  FlashcardsView,
  GoalsView,
  OrderView,
  TermsView,
  VideoView,
} from "./TutorialBlockViews";
import { AssignmentView, QuizView } from "./TutorialViews";

export interface EditorChange {
  markdown: string;
}

const VIEWS: Record<
  TutorialKind | "citation" | "bibliography",
  React.ComponentType<ReactNodeViewProps>
> = {
  citation: CitationView,
  bibliography: BibliographyView,
  quiz: QuizView,
  assignment: AssignmentView,
  goals: GoalsView,
  terms: TermsView,
  video: VideoView,
  compare: CompareView,
  blanks: BlanksView,
  order: OrderView,
  exercise: ExerciseView,
  flashcards: FlashcardsView,
};

/** The document's blocks, with the tutorial blocks drawn as forms and references in APA style. */
const withTutorialViews = (extensions: AnyExtension[]): AnyExtension[] =>
  extensions.map((extension) => {
    const view = VIEWS[extension.name as keyof typeof VIEWS] as
      React.ComponentType<ReactNodeViewProps> | undefined;
    if (!view || extension.type !== "node") return extension;
    return (extension as TiptapNode).extend({
      addNodeView() {
        return ReactNodeViewRenderer(view);
      },
    });
  });

interface DropLine {
  top: number;
  left: number;
  width: number;
}

/** Where a dragged block would land: the position between two top-level blocks. */
function blockDrop(
  view: EditorView,
  y: number,
): { pos: number; line: DropLine } | null {
  const doc = view.state.doc;
  const box = view.dom.getBoundingClientRect();
  const line = (top: number) => ({ top: top - 1, left: box.left, width: box.width });
  let pos = 0;
  let last: DOMRect | null = null;
  for (let index = 0; index < doc.childCount; index++) {
    const dom = view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      const rect = dom.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        const gap = last ? (last.bottom + rect.top) / 2 : rect.top - 2;
        return { pos, line: line(gap) };
      }
      last = rect;
    }
    pos += doc.child(index).nodeSize;
  }
  return last ? { pos, line: line(last.bottom + 2) } : null;
}

/** Moves the top-level block at `from` to the position `to` between blocks. */
function moveBlock(view: EditorView, from: number, to: number): void {
  const node = view.state.doc.nodeAt(from);
  if (!node || to === from || to === from + node.nodeSize) return;
  const tr = view.state.tr.delete(from, from + node.nodeSize);
  const at = tr.mapping.map(to);
  tr.insert(at, node);
  tr.setSelection(
    node.isTextblock
      ? TextSelection.near(tr.doc.resolve(at + 1))
      : NodeSelection.create(tr.doc, at),
  );
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

/** The visual face of a page: blocks you edit in place. */
export function Editor({
  markdown,
  onChange,
  focusRef,
  focusEndRef,
  editorRef,
  inSlide = false,
}: {
  /** The page when the editor opens; later edits live in the editor. */
  markdown: string;
  onChange: (change: EditorChange) => void;
  /** Filled with a function that puts the caret at the start of the page. */
  focusRef?: React.RefObject<(() => void) | null>;
  /**
   * Filled with a function that puts the caret on the last line, under
   * a new empty line when the page ends in a block without text.
   */
  focusEndRef?: React.RefObject<(() => void) | null>;
  /** Filled with the editor, for whoever works on its blocks from outside. */
  editorRef?: React.RefObject<TiptapEditor | null>;
  /**
   * The page is a slide: it is drawn scaled, so its menus hang from
   * the window and not from the page, and blocks have no handle.
   */
  inSlide?: boolean;
}) {
  const [math, setMath] = useState<MathTarget | null>(null);
  const [note, setNote] = useState<number | null>(null);
  const [controller] = useState(createSlashController);
  const slash = useSyncExternalStore(controller.subscribe, controller.getState);
  const [citer] = useState(createCiteController);
  const cite = useSyncExternalStore(citer.subscribe, citer.getState);
  const [linker] = useState(createLinkMenuController);
  const linking = useSyncExternalStore(linker.subscribe, linker.getState);
  const workspace = useWorkspace();
  const workspaceRef = useRef(workspace);
  useEffect(() => {
    workspaceRef.current = workspace;
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const fileKind = useRef<"image" | "file">("image");
  const filesAt = useRef<number | null>(null);
  const hovered = useRef<{ node: ProseNode; pos: number } | null>(null);
  const [dropLine, setDropLine] = useState<DropLine | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const [dropper] = useState(createFileDropController);

  /** Adds files to the project and puts them in the page at `pos`, or at the caret. */
  const addFiles = (target: TiptapEditor, files: File[], pos: number | null) => {
    const { addFiles: add, active, canAddFiles } = workspaceRef.current;
    if (!canAddFiles || !files.length) return false;
    void add(files).then((paths) => {
      const dir = active ? parentOf(active) : "";
      insertFiles(
        target,
        paths.map((path, index) => ({
          href: relativeHref(dir, path),
          name: files[index]?.name ?? path,
          image: files[index]?.type.startsWith("image/") ?? false,
        })),
        pos ?? undefined,
      );
    });
    return true;
  };

  const [extensions] = useState(() => [
    ...withPageViews(withTutorialViews(
      documentExtensions({
        codeBlock: CodeBlockLowlight.extend({
          addNodeView() {
            return ReactNodeViewRenderer(CodeBlockView);
          },
        }).configure({ lowlight }),
        mathematics: BlockMath.configure({
          katexOptions: { throwOnError: false, displayMode: true },
          onClick: (_node, pos) => setMath({ pos, kind: "blockMath" }),
        }),
        footnote: Footnote.configure({ onOpen: setNote }),
      }),
    )),
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
    Cite.configure(citer.options),
    PageLinkMenu.configure(linker.options),
    FileDrop.configure(dropper.options),
    Find,
  ]);

  const editor = useEditor({
    extensions,
    content: inlineNumberedNotes(markdown),
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
    if (focusEndRef) {
      focusEndRef.current = () => {
        const { doc } = editor.state;
        if (Selection.atEnd(doc) instanceof TextSelection) {
          editor.commands.focus("end");
        } else {
          editor
            .chain()
            .insertContentAt(doc.content.size, { type: "paragraph" })
            .focus("end")
            .run();
        }
      };
    }
    if (editorRef) editorRef.current = editor;
  }, [editor, focusRef, focusEndRef, editorRef]);

  const addFilesHere = useRef(addFiles);
  useEffect(() => {
    addFilesHere.current = addFiles;
  });
  useEffect(
    () => dropper.handle((files, pos) => addFilesHere.current(editor, files, pos)),
    [dropper, editor],
  );

  // The find bar works on this page, or on the slide shown.
  useEffect(() => offerFindTarget(findTargetFor(editor)), [editor]);

  // The Image and File blocks of the slash menu ask for files to add.
  useEffect(() => {
    const pick = (event: Event) => {
      if (!editor.view.hasFocus() || !workspaceRef.current.canAddFiles) return;
      fileKind.current = (event as CustomEvent<"image" | "file">).detail;
      // Where the caret is once the slash menu took its text away.
      filesAt.current = editor.state.selection.from;
      queueMicrotask(() => {
        filesAt.current = editor.state.selection.from;
      });
      const input = fileInput.current;
      if (!input) return;
      input.accept = fileKind.current === "image" ? "image/*" : "";
      input.value = "";
      input.click();
    };
    window.addEventListener("cursive:add-files", pick);
    return () => window.removeEventListener("cursive:add-files", pick);
  }, [editor]);

  // Blocks move with the pointer, not the browser's drag and drop: the
  // handle never starts one.
  useEffect(() => {
    const stop = (event: DragEvent) => {
      if ((event.target as Element | null)?.closest?.(".block-handle")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("dragstart", stop, true);
    return () => window.removeEventListener("dragstart", stop, true);
  }, []);

  const lockHandle = (locked: boolean) =>
    editor.view.dispatch(editor.state.tr.setMeta("lockDragHandle", locked));

  /** Pressing the grip: dragging it moves the hovered block. */
  const pressGrip = (event: React.PointerEvent) => {
    const source = hovered.current;
    if (event.button !== 0 || !source) return;
    event.preventDefault();
    const view = editor.view;
    const from = source.pos;
    const dom = view.nodeDOM(from);
    const scroller = view.dom.closest("#page-scroll");
    let to: number | null = null;
    // The handle stays on the pressed block while the pointer travels.
    lockHandle(true);
    startPointerDrag(event, {
      onStart: () => {
        if (dom instanceof HTMLElement) dom.classList.add("block-dragging");
      },
      onMove: (move) => {
        scrollNearEdge(scroller, move.clientY);
        const found = blockDrop(view, move.clientY);
        to = found?.pos ?? null;
        setDropLine(found?.line ?? null);
      },
      onDrop: () => {
        if (to !== null) moveBlock(view, from, to);
      },
      onEnd: () => {
        if (dom instanceof HTMLElement) dom.classList.remove("block-dragging");
        setDropLine(null);
        lockHandle(false);
      },
    });
  };

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
      {cite && <CiteMenu state={cite} controller={citer} />}
      {linking && <LinkMenu state={linking} controller={linker} />}
      {math && (
        <MathPopover
          key={`${math.kind}:${math.pos}`}
          editor={editor}
          target={math}
          onClose={() => setMath(null)}
        />
      )}
      {note !== null && (
        <FootnotePopover
          key={note}
          editor={editor}
          pos={note}
          onClose={() => setNote(null)}
        />
      )}
    </>
  );

  const picker = (
    <input
      ref={fileInput}
      type="file"
      multiple
      hidden
      onChange={(event) => {
        const files = [...(event.target.files ?? [])];
        if (files.length) addFiles(editor, files, filesAt.current);
      }}
    />
  );

  if (inSlide) {
    return (
      <>
        {picker}
        <EditorContent editor={editor} />
        <Footnotes editor={editor} onOpen={setNote} />
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
          onPointerDown={pressGrip}
        >
          <GripVertical aria-hidden />
        </span>
      </DragHandle>
      {picker}
      <EditorContent editor={editor} />
      <Footnotes editor={editor} onOpen={setNote} />
      {dropLine &&
        createPortal(
          <div className="block-drop-line" style={dropLine} />,
          document.body,
        )}
      <SelectionToolbar editor={editor} />
      {menus}
    </>
  );
}
