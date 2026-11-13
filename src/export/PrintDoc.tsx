import type { AnyExtension, Node as TiptapNode } from "@tiptap/core";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { useState } from "react";
import { withReferenceViews } from "@/components/ReferenceViews";
import { points } from "@/components/TutorialViews";
import { documentExtensions } from "@/editor/extensions";
import {
  readAssignment,
  readBlanks,
  readCompare,
  readExercise,
  readFlashcards,
  readGoals,
  readOrder,
  readQuiz,
  readTerms,
  readVideo,
  splitBlanks,
  type TutorialKind,
} from "@/tutorial/blocks";

/**
 * The tutorial blocks on paper: what a reader of the published page
 * sees before answering. Answers, hints and explanations stay out, so
 * the PDF works as a handout.
 */
function Block({
  kind,
  note,
  children,
}: {
  kind: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <NodeViewWrapper className="print-block">
      <p className="print-block-kind">
        {kind}
        {note && <span>{note}</span>}
      </p>
      {children}
    </NodeViewWrapper>
  );
}

const sourceOf = (props: ReactNodeViewProps) => props.node.attrs.source as string;

/**
 * Items in another order than they were written in, the same one each
 * time: the written order is the answer.
 */
export function mixed<T>(items: T[]): T[] {
  if (items.length < 2) return items;
  const half = Math.ceil(items.length / 2);
  const out: T[] = [];
  for (let i = 0; i < half; i++) {
    if (half + i < items.length) out.push(items[half + i]);
    out.push(items[i]);
  }
  return out;
}

function QuizPrint(props: ReactNodeViewProps) {
  const quiz = readQuiz(sourceOf(props));
  if (!quiz) return <NodeViewWrapper />;
  const many = quiz.answer.length > 1;
  return (
    <Block kind="Quiz" note={points(quiz.points)}>
      <p className="print-block-title">{quiz.question}</p>
      <ul className="print-options">
        {quiz.options.map((option, index) => (
          <li key={index}>
            <span className={many ? "print-box" : "print-box print-round"} />
            {option}
          </li>
        ))}
      </ul>
      {many && <p className="print-block-hint">More than one answer is correct.</p>}
    </Block>
  );
}

function AssignmentPrint(props: ReactNodeViewProps) {
  const assignment = readAssignment(sourceOf(props));
  if (!assignment) return <NodeViewWrapper />;
  const due = assignment.due
    ? new Date(`${assignment.due}T00:00:00`).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";
  return (
    <Block
      kind="Assignment"
      note={[points(assignment.points), due && `Due ${due}`]
        .filter(Boolean)
        .join(" · ")}
    >
      <p className="print-block-title">{assignment.title}</p>
      <PrintDoc markdown={assignment.instructions} />
      {assignment.rubric.length > 0 && (
        <table className="print-rubric">
          <tbody>
            {assignment.rubric.map((row, index) => (
              <tr key={index}>
                <td>{row.criterion}</td>
                <td>{points(row.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Block>
  );
}

function GoalsPrint(props: ReactNodeViewProps) {
  const goals = readGoals(sourceOf(props));
  return (
    <Block kind="Learning goals">
      <ul>
        {goals?.items.filter(Boolean).map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </Block>
  );
}

function TermsPrint(props: ReactNodeViewProps) {
  const terms = readTerms(sourceOf(props));
  return (
    <Block kind="Key terms">
      <dl className="print-terms">
        {terms?.terms.map((term, index) => (
          <div key={index}>
            <dt>{term.term}</dt>
            <dd>{term.definition}</dd>
          </div>
        ))}
      </dl>
    </Block>
  );
}

function VideoPrint(props: ReactNodeViewProps) {
  const video = readVideo(sourceOf(props));
  if (!video?.url) return <NodeViewWrapper />;
  return (
    <Block kind="Video">
      {video.title && <p className="print-block-title">{video.title}</p>}
      <p>
        <a href={video.url}>{video.url}</a>
      </p>
    </Block>
  );
}

function ComparePrint(props: ReactNodeViewProps) {
  const compare = readCompare(sourceOf(props));
  return (
    <Block kind="Before and after">
      <div className="print-pair">
        <div>
          <p className="print-block-hint">Before</p>
          <PrintDoc markdown={compare?.before ?? ""} />
        </div>
        <div>
          <p className="print-block-hint">After</p>
          <PrintDoc markdown={compare?.after ?? ""} />
        </div>
      </div>
    </Block>
  );
}

function BlanksPrint(props: ReactNodeViewProps) {
  const blanks = readBlanks(sourceOf(props));
  const { parts } = splitBlanks(blanks?.text ?? "");
  return (
    <Block kind="Fill in the blanks">
      <p className="print-blanks">
        {parts.map((text, index) => (
          <span key={index}>
            {index > 0 && <span className="print-gap" />}
            {text}
          </span>
        ))}
      </p>
    </Block>
  );
}

function OrderPrint(props: ReactNodeViewProps) {
  const order = readOrder(sourceOf(props));
  return (
    <Block kind="Put in order">
      {order?.prompt && <p className="print-block-title">{order.prompt}</p>}
      <ul className="print-options">
        {mixed(order?.items.filter(Boolean) ?? []).map((item, index) => (
          <li key={index}>
            <span className="print-box" />
            {item}
          </li>
        ))}
      </ul>
    </Block>
  );
}

function ExercisePrint(props: ReactNodeViewProps) {
  const exercise = readExercise(sourceOf(props));
  return (
    <Block kind="Exercise">
      <PrintDoc markdown={exercise?.prompt ?? ""} />
    </Block>
  );
}

function FlashcardsPrint(props: ReactNodeViewProps) {
  const cards = readFlashcards(sourceOf(props));
  return (
    <Block kind="Flashcards">
      <dl className="print-terms">
        {cards?.cards.map((card, index) => (
          <div key={index}>
            <dt>{card.front}</dt>
            <dd>{card.back}</dd>
          </div>
        ))}
      </dl>
    </Block>
  );
}

const VIEWS: Record<TutorialKind, React.ComponentType<ReactNodeViewProps>> = {
  quiz: QuizPrint,
  assignment: AssignmentPrint,
  goals: GoalsPrint,
  terms: TermsPrint,
  video: VideoPrint,
  compare: ComparePrint,
  blanks: BlanksPrint,
  order: OrderPrint,
  exercise: ExercisePrint,
  flashcards: FlashcardsPrint,
};

const printExtensions = (): AnyExtension[] =>
  withReferenceViews(documentExtensions()).map((extension) => {
    const view = VIEWS[extension.name as TutorialKind] as
      React.ComponentType<ReactNodeViewProps> | undefined;
    if (!view || extension.type !== "node") return extension;
    return (extension as TiptapNode).extend({
      addNodeView() {
        return ReactNodeViewRenderer(view);
      },
    });
  });

/** A page's blocks as they go on paper: not editable, tutorial blocks as handouts. */
export function PrintDoc({ markdown }: { markdown: string }) {
  const [extensions] = useState(printExtensions);
  const editor = useEditor({
    extensions,
    content: markdown,
    contentType: "markdown",
    editable: false,
    editorProps: { attributes: { class: "doc" } },
  });
  return <EditorContent editor={editor} />;
}
