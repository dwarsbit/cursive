import { EditorContent, useEditor } from "@tiptap/react";
import { memo, useEffect, useRef, useState } from "react";
import { Footnotes } from "@/components/Footnotes";
import { withReferenceViews } from "@/components/ReferenceViews";
import { documentExtensions } from "@/editor/extensions";
import type { Slide } from "./deck";
import { SlideFrame } from "./SlideFrame";

/** A slide as its audience sees it: the blocks, not editable. */
export const SlideView = memo(function SlideView({
  layout,
  small,
  body,
  footer,
  number,
  className,
  onOver,
}: Pick<Slide, "layout" | "small" | "body"> & {
  footer?: string;
  number?: number;
  className?: string;
  onOver?: (over: boolean) => void;
}) {
  const [extensions] = useState(() => withReferenceViews(documentExtensions()));
  const shown = useRef(body);
  const editor = useEditor({
    extensions,
    content: body,
    contentType: "markdown",
    editable: false,
    editorProps: { attributes: { class: "doc" } },
  });
  useEffect(() => {
    if (shown.current === body) return;
    shown.current = body;
    editor.commands.setContent(body, { contentType: "markdown" });
  }, [editor, body]);

  return (
    <SlideFrame
      slide={{ layout, small }}
      footer={footer}
      number={number}
      className={className}
      onOver={onOver}
    >
      <EditorContent editor={editor} />
      <Footnotes editor={editor} />
    </SlideFrame>
  );
});
