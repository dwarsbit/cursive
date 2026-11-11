import type { ChainedCommands, Editor } from "@tiptap/core";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  Code,
  Info,
  List,
  ListOrdered,
  Minus,
  Quote,
  SquareCheck,
  Table,
} from "lucide-react";

/** A block the slash menu and the "Turn into" menu can make. */
export interface BlockItem {
  id: string;
  title: string;
  description: string;
  /** Extra words the slash menu's filter matches. */
  keywords: string[];
  group: "Basic blocks" | "More blocks";
  /** The tile: a few letters or an icon. */
  glyph: string | LucideIcon;
  /** Whether a block with text can be turned into this one. */
  turnInto: boolean;
  isActive?: (editor: Editor) => boolean;
  run: (chain: ChainedCommands) => ChainedCommands;
}

export const BLOCKS: BlockItem[] = [
  {
    id: "text",
    title: "Text",
    description: "A plain paragraph",
    keywords: ["paragraph", "plain"],
    group: "Basic blocks",
    glyph: "Aa",
    turnInto: true,
    run: (chain) => chain.clearNodes(),
  },
  {
    id: "heading-1",
    title: "Heading 1",
    description: "Large section heading",
    keywords: ["h1", "title"],
    group: "Basic blocks",
    glyph: "H1",
    turnInto: true,
    isActive: (editor) => editor.isActive("heading", { level: 1 }),
    run: (chain) => chain.clearNodes().setNode("heading", { level: 1 }),
  },
  {
    id: "heading-2",
    title: "Heading 2",
    description: "Medium section heading",
    keywords: ["h2", "subtitle"],
    group: "Basic blocks",
    glyph: "H2",
    turnInto: true,
    isActive: (editor) => editor.isActive("heading", { level: 2 }),
    run: (chain) => chain.clearNodes().setNode("heading", { level: 2 }),
  },
  {
    id: "heading-3",
    title: "Heading 3",
    description: "Small section heading",
    keywords: ["h3"],
    group: "Basic blocks",
    glyph: "H3",
    turnInto: true,
    isActive: (editor) => editor.isActive("heading", { level: 3 }),
    run: (chain) => chain.clearNodes().setNode("heading", { level: 3 }),
  },
  {
    id: "to-do",
    title: "To-do list",
    description: "Track tasks with checkboxes",
    keywords: ["todo", "task", "checkbox", "check"],
    group: "Basic blocks",
    glyph: SquareCheck,
    turnInto: true,
    isActive: (editor) => editor.isActive("taskList"),
    run: (chain) => chain.clearNodes().toggleTaskList(),
  },
  {
    id: "bulleted-list",
    title: "Bulleted list",
    description: "A simple list",
    keywords: ["bullet", "unordered", "ul"],
    group: "Basic blocks",
    glyph: List,
    turnInto: true,
    isActive: (editor) => editor.isActive("bulletList"),
    run: (chain) => chain.clearNodes().toggleBulletList(),
  },
  {
    id: "numbered-list",
    title: "Numbered list",
    description: "A list with numbers",
    keywords: ["ordered", "ol", "steps"],
    group: "Basic blocks",
    glyph: ListOrdered,
    turnInto: true,
    isActive: (editor) => editor.isActive("orderedList"),
    run: (chain) => chain.clearNodes().toggleOrderedList(),
  },
  {
    id: "toggle",
    title: "Toggle",
    description: "A line that hides the text under it",
    keywords: ["details", "collapse", "fold"],
    group: "More blocks",
    glyph: ChevronRight,
    turnInto: false,
    isActive: (editor) => editor.isActive("details"),
    run: (chain) =>
      chain.clearNodes().setDetails().updateAttributes("details", { open: true }),
  },
  {
    id: "quote",
    title: "Quote",
    description: "A quotation, set apart",
    keywords: ["blockquote", "citation"],
    group: "More blocks",
    glyph: Quote,
    turnInto: true,
    isActive: (editor) => editor.isActive("blockquote"),
    run: (chain) => chain.clearNodes().setBlockquote(),
  },
  {
    id: "callout",
    title: "Callout",
    description: "A note that stands out",
    keywords: ["note", "info", "tip", "warning", "alert"],
    group: "More blocks",
    glyph: Info,
    turnInto: true,
    isActive: (editor) => editor.isActive("callout"),
    run: (chain) => chain.clearNodes().setCallout("note"),
  },
  {
    id: "table",
    title: "Table",
    description: "Rows and columns",
    keywords: ["grid", "columns", "rows"],
    group: "More blocks",
    glyph: Table,
    turnInto: false,
    run: (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
  },
  {
    id: "code",
    title: "Code",
    description: "A block with syntax colors",
    keywords: ["codeblock", "snippet", "pre"],
    group: "More blocks",
    glyph: Code,
    turnInto: true,
    isActive: (editor) => editor.isActive("codeBlock"),
    run: (chain) => chain.clearNodes().setCodeBlock(),
  },
  {
    id: "equation",
    title: "Equation",
    description: "Display math, written in TeX",
    keywords: ["math", "latex", "tex", "formula"],
    group: "More blocks",
    glyph: "∑",
    turnInto: false,
    run: (chain) => chain.insertContent({ type: "blockMath", attrs: { latex: "" } }),
  },
  {
    id: "divider",
    title: "Divider",
    description: "A line between sections",
    keywords: ["rule", "hr", "line", "separator"],
    group: "More blocks",
    glyph: Minus,
    turnInto: false,
    run: (chain) => chain.setHorizontalRule(),
  },
];

/**
 * The blocks that match what was typed after the slash: titles that
 * start with it first, then later words of a title, then keywords.
 */
export function filterBlocks(query: string, blocks: BlockItem[] = BLOCKS): BlockItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return blocks;
  const rank = (block: BlockItem): number => {
    const title = block.title.toLowerCase();
    if (title.startsWith(q)) return 0;
    if (title.split(/[\s-]/).some((word) => word.startsWith(q))) return 1;
    if (block.keywords.some((keyword) => keyword.startsWith(q))) return 2;
    return -1;
  };
  return blocks
    .map((block, index) => ({ block, index, rank: rank(block) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.block);
}

/** The block the caret is in, for the label on the "Turn into" button. */
export function currentBlock(editor: Editor): BlockItem {
  const inner = ["heading-1", "heading-2", "heading-3", "code"];
  const outer = [
    "to-do",
    "bulleted-list",
    "numbered-list",
    "toggle",
    "callout",
    "quote",
  ];
  for (const id of [...inner, ...outer]) {
    const block = BLOCKS.find((item) => item.id === id);
    if (block?.isActive?.(editor)) return block;
  }
  return BLOCKS[0];
}
