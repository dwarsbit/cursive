import { mergeAttributes, Node } from "@tiptap/core";
import { matchFence, toFence, TUTORIAL_KINDS, type TutorialKind } from "./blocks";

/**
 * A tutorial block as a node: one unit in the page that holds the
 * fence's YAML as written. The editor draws it as a form
 * (`TutorialViews.tsx`); the YAML only changes when a field does.
 */
function fenceNode(kind: TutorialKind) {
  return Node.create({
    name: kind,
    group: "block",
    atom: true,
    selectable: true,

    addAttributes() {
      return {
        source: {
          default: "",
          parseHTML: (el) => el.getAttribute("data-source") ?? "",
          renderHTML: (attrs) => ({ "data-source": attrs.source as string }),
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-tutorial="${kind}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-tutorial": kind })];
    },

    markdownTokenizer: {
      name: kind,
      level: "block",
      start: (src) => src.search(new RegExp(`^\`{3,}${kind}[ \\t]*$`, "m")),
      tokenize(src) {
        const fence = matchFence(kind, src);
        return fence ? { type: kind, raw: fence.raw, source: fence.source } : undefined;
      },
    },

    parseMarkdown(token, helpers) {
      return helpers.createNode(kind, { source: token.source as string });
    },

    renderMarkdown(node) {
      return toFence(kind, (node.attrs?.source as string | undefined) ?? "");
    },
  });
}

export const QuizNode = fenceNode("quiz");
export const AssignmentNode = fenceNode("assignment");

/** Every tutorial block as a node, in the order of TUTORIAL_KINDS. */
export const TUTORIAL_NODES = TUTORIAL_KINDS.map((kind) =>
  kind === "quiz" ? QuizNode : kind === "assignment" ? AssignmentNode : fenceNode(kind),
);
