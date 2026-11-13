import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Check,
  ChevronDown,
  Code,
  Highlighter,
  Link,
  Superscript,
  Unlink,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { BLOCKS, currentBlock } from "@/editor/blocks";
import { cn } from "@/lib/cn";

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "grid h-7 min-w-7 place-items-center rounded-[5px] px-1.5 text-[13px] hover:bg-accent",
        active && "bg-tint-soft text-tint-foreground",
      )}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-[18px] w-px bg-border" />;

/** A link's address as typed, with https:// added when it has no scheme. */
export function normalizeHref(input: string): string {
  const href = input.trim();
  if (!href) return "";
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(href)) return href;
  return `https://${href}`;
}

/** The toolbar that appears over selected text. */
export function SelectionToolbar({
  editor,
  appendTo,
}: {
  editor: Editor;
  /** Where the toolbar is put in the document; next to the page when left out. */
  appendTo?: () => HTMLElement;
}) {
  const [panel, setPanel] = useState<"none" | "turn" | "link">("none");
  const [href, setHref] = useState("");

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      highlight: e.isActive("highlight"),
      link: e.isActive("link"),
      block: currentBlock(e).id,
    }),
  });
  const block = BLOCKS.find((item) => item.id === state.block) ?? BLOCKS[0];

  const openLink = () => {
    setHref((editor.getAttributes("link").href as string | undefined) ?? "");
    setPanel("link");
  };
  const applyLink = () => {
    const url = normalizeHref(href);
    const chain = editor.chain().focus().extendMarkRange("link");
    if (url) chain.setLink({ href: url }).run();
    else chain.unsetLink().run();
    setPanel("none");
  };

  return (
    <BubbleMenu
      editor={editor}
      appendTo={appendTo}
      options={{ placement: "top", offset: 8, onHide: () => setPanel("none") }}
      shouldShow={({ editor: e, state: s }) =>
        e.isEditable &&
        !s.selection.empty &&
        !e.isActive("codeBlock") &&
        s.doc.textBetween(s.selection.from, s.selection.to, " ").trim().length > 0
      }
    >
      <div className="popover relative flex items-center gap-px p-[3px]" role="toolbar">
        {panel === "link" ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              applyLink();
            }}
          >
            <input
              autoFocus
              value={href}
              onChange={(event) => setHref(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setPanel("none");
                  editor.commands.focus();
                }
              }}
              placeholder="Paste or type a link"
              aria-label="Link address"
              className="h-7 w-56 rounded-[5px] bg-transparent px-2 text-[13px] outline-none placeholder:text-muted-foreground"
            />
            <ToolButton label="Apply link" onClick={applyLink}>
              <Check className="size-3.5" />
            </ToolButton>
            {state.link && (
              <ToolButton
                label="Remove link"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setPanel("none");
                }}
              >
                <Unlink className="size-3.5" />
              </ToolButton>
            )}
          </form>
        ) : (
          <>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={panel === "turn"}
              aria-label={`Turn into, now ${block.title}`}
              onClick={() => setPanel(panel === "turn" ? "none" : "turn")}
              className="flex h-7 items-center gap-1 rounded-[5px] px-2 text-[13px] font-medium text-accent-foreground hover:bg-accent"
            >
              {block.title}
              <ChevronDown className="size-3.5" />
            </button>
            <Divider />
            <ToolButton
              label="Bold"
              active={state.bold}
              onClick={() => editor.chain().focus().toggleBold().run()}
            >
              <b>B</b>
            </ToolButton>
            <ToolButton
              label="Italic"
              active={state.italic}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            >
              <i className="font-serif">I</i>
            </ToolButton>
            <ToolButton
              label="Underline"
              active={state.underline}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
            >
              <u>U</u>
            </ToolButton>
            <ToolButton
              label="Strikethrough"
              active={state.strike}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            >
              <s>S</s>
            </ToolButton>
            <ToolButton
              label="Inline code"
              active={state.code}
              onClick={() => editor.chain().focus().toggleCode().run()}
            >
              <Code className="size-3.5" />
            </ToolButton>
            <ToolButton
              label="Highlight"
              active={state.highlight}
              onClick={() => editor.chain().focus().toggleHighlight().run()}
            >
              <Highlighter className="size-3.5" />
            </ToolButton>
            <ToolButton label="Link" active={state.link} onClick={openLink}>
              <Link className="size-3.5" />
            </ToolButton>
            <ToolButton
              label="Footnote"
              onClick={() => editor.chain().focus().insertFootnote().run()}
            >
              <Superscript className="size-3.5" />
            </ToolButton>
          </>
        )}
        {panel === "turn" && (
          <div
            role="menu"
            aria-label="Turn into"
            className="popover absolute top-full left-0 mt-1.5 w-48 p-1 text-[13px]"
          >
            {BLOCKS.filter((item) => item.turnInto).map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.id === block.id}
                className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-accent"
                onClick={() => {
                  item.run(editor.chain().focus()).run();
                  setPanel("none");
                }}
              >
                <span className="flex-1">{item.title}</span>
                {item.id === block.id && <Check className="size-3.5 text-tint" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </BubbleMenu>
  );
}
