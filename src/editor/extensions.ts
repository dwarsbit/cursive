import type { AnyExtension } from "@tiptap/core";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Highlight } from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Mathematics } from "@tiptap/extension-mathematics";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { Callout } from "./callout";
import { Toggle, ToggleContent, ToggleSummary } from "./toggle";
import { Bibliography, Citation } from "@/references/nodes";
import { TUTORIAL_NODES } from "@/tutorial/nodes";

export const lowlight = createLowlight(common);

/**
 * The document model shared by Visual and Markdown mode: every block
 * here reads from and writes to Markdown. The interface around it (the
 * slash menu, placeholders, node views) is added by the editor.
 */
export function documentExtensions(
  overrides: { codeBlock?: AnyExtension; mathematics?: AnyExtension } = {},
): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true },
      dropcursor: { color: "var(--tint)", width: 2 },
    }),
    overrides.codeBlock ?? CodeBlockLowlight.configure({ lowlight }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Highlight,
    overrides.mathematics ?? Mathematics,
    Callout,
    Toggle.configure({ persist: true, HTMLAttributes: { class: "toggle" } }),
    ToggleSummary,
    ToggleContent,
    ...TUTORIAL_NODES,
    Citation,
    Bibliography,
    Markdown,
  ];
}
