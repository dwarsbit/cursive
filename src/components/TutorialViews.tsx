import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { CircleHelp, ClipboardList, Plus, X } from "lucide-react";
import { useRef } from "react";
import {
  readAssignment,
  readQuiz,
  writeAssignment,
  writeQuiz,
  type Assignment,
  type Criterion,
  type Quiz,
} from "@/tutorial/blocks";

/** A whole number from a field; empty or anything else is `fallback`. */
export const whole = (value: string, fallback: number) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 1000) : fallback;
};

export function Frame({
  icon,
  kind,
  note,
  chip,
  selected,
  children,
}: {
  icon: React.ReactNode;
  kind: string;
  note: string;
  chip: string;
  selected: boolean;
  children: React.ReactNode;
}) {
  return (
    <NodeViewWrapper
      className={`tutorial-block${selected ? " is-selected" : ""}`}
      contentEditable={false}
    >
      <div className="tb-head" data-drag-handle>
        <span className="tb-kind">
          {icon}
          {kind}
        </span>
        <span className="truncate">{note}</span>
        <span className="flex-1" />
        <span className="tb-chip">{chip}</span>
      </div>
      <div className="tb-body">{children}</div>
    </NodeViewWrapper>
  );
}

export const points = (n: number) => (n === 1 ? "1 point" : `${n} points`);

/** A quiz as the author sees it: the question, its options and which are correct. */
export function QuizView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const source = node.attrs.source as string;
  const quiz = readQuiz(source) ?? readQuiz("{}")!;
  const list = useRef<HTMLDivElement>(null);
  const set = (change: Partial<Quiz>) =>
    updateAttributes({ source: writeQuiz({ ...quiz, ...change }, source) });

  const many = quiz.answer.length > 1;
  const toggle = (n: number, exclusive: boolean) => {
    if (exclusive) return set({ answer: [n] });
    const next = quiz.answer.includes(n)
      ? quiz.answer.filter((a) => a !== n)
      : [...quiz.answer, n].sort((a, b) => a - b);
    set({ answer: next });
  };
  const removeOption = (index: number) =>
    set({
      options: quiz.options.filter((_, i) => i !== index),
      answer: quiz.answer
        .filter((a) => a !== index + 1)
        .map((a) => (a > index + 1 ? a - 1 : a)),
    });
  const addOption = () => {
    set({ options: [...quiz.options, ""] });
    requestAnimationFrame(() => {
      const inputs =
        list.current?.querySelectorAll<HTMLInputElement>(".tb-option-text");
      inputs?.[inputs.length - 1]?.focus();
    });
  };

  return (
    <Frame
      icon={<CircleHelp aria-hidden />}
      kind="Quiz"
      note={many ? "Several correct answers" : "One correct answer"}
      chip={points(quiz.points)}
      selected={selected}
    >
      <input
        className="tb-input tb-question"
        value={quiz.question}
        placeholder="Question"
        aria-label="Question"
        onChange={(event) => set({ question: event.target.value })}
      />
      <div className="tb-options" ref={list}>
        {quiz.options.map((option, index) => {
          const n = index + 1;
          const correct = quiz.answer.includes(n);
          return (
            <div key={index} className={`tb-option${correct ? " is-correct" : ""}`}>
              <input
                type="checkbox"
                checked={correct}
                aria-label={`Option ${n} is correct`}
                title="Correct answer"
                onChange={() => toggle(n, !many)}
              />
              <input
                className="tb-input tb-option-text"
                value={option}
                placeholder={`Option ${n}`}
                aria-label={`Option ${n}`}
                onChange={(event) =>
                  set({
                    options: quiz.options.map((o, i) =>
                      i === index ? event.target.value : o,
                    ),
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addOption();
                  }
                }}
              />
              {correct && <span className="tb-key">Correct</span>}
              <button
                type="button"
                className="tb-remove"
                aria-label={`Remove option ${n}`}
                title="Remove option"
                disabled={quiz.options.length <= 2}
                onClick={() => removeOption(index)}
              >
                <X aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      <div className="tb-row">
        <button type="button" className="tb-button" onClick={addOption}>
          <Plus aria-hidden />
          Add option
        </button>
        <button
          type="button"
          className="tb-button"
          onClick={() =>
            set({
              answer: many
                ? quiz.answer.slice(0, 1)
                : [
                    ...quiz.answer,
                    quiz.options.findIndex((_, i) => !quiz.answer.includes(i + 1)) + 1,
                  ]
                    .filter((n) => n > 0)
                    .sort((a, b) => a - b),
            })
          }
        >
          {many ? "Allow one answer" : "Allow several answers"}
        </button>
        <span className="flex-1" />
        <label className="tb-field">
          Points
          <input
            type="number"
            min={0}
            max={1000}
            className="tb-input tb-number"
            value={quiz.points}
            onChange={(event) => set({ points: whole(event.target.value, 0) })}
          />
        </label>
        <label className="tb-field">
          Attempts
          <input
            type="number"
            min={1}
            max={1000}
            className="tb-input tb-number"
            value={quiz.attempts || ""}
            placeholder="Any"
            title="How often a learner can check an answer. Empty: as often as they like."
            onChange={(event) => set({ attempts: whole(event.target.value, 0) })}
          />
        </label>
      </div>
      <textarea
        className="tb-input tb-text"
        rows={2}
        value={quiz.explanation}
        placeholder="Explanation, shown after the answer (optional)"
        aria-label="Explanation"
        onChange={(event) => set({ explanation: event.target.value })}
      />
      {quiz.answer.length === 0 && (
        <p className="tb-warning" role="status">
          Tick the correct answer.
        </p>
      )}
    </Frame>
  );
}

/** An assignment as the author sees it: what to hand in, by when, for how many points. */
export function AssignmentView({
  node,
  updateAttributes,
  selected,
}: ReactNodeViewProps) {
  const source = node.attrs.source as string;
  const assignment = readAssignment(source) ?? readAssignment("{}")!;
  const set = (change: Partial<Assignment>) =>
    updateAttributes({
      source: writeAssignment({ ...assignment, ...change }, source),
    });
  const rubric = useRef<HTMLDivElement>(null);
  const graded = assignment.rubric.length > 0;
  const setRow = (index: number, change: Partial<Criterion>) =>
    set({
      rubric: assignment.rubric.map((row, i) =>
        i === index ? { ...row, ...change } : row,
      ),
    });
  const addRow = () => {
    // The first criterion takes the points the assignment had.
    set({
      rubric: [
        ...assignment.rubric,
        { criterion: "", points: graded ? 1 : assignment.points },
      ],
    });
    requestAnimationFrame(() => {
      const inputs =
        rubric.current?.querySelectorAll<HTMLInputElement>(".tb-criterion");
      inputs?.[inputs.length - 1]?.focus();
    });
  };

  return (
    <Frame
      icon={<ClipboardList aria-hidden />}
      kind="Assignment"
      note={
        assignment.files
          ? "Learners hand in text, a file or both"
          : "Learners hand in their work as text"
      }
      chip={assignment.points ? points(assignment.points) : "Not graded"}
      selected={selected}
    >
      <input
        className="tb-input tb-question"
        value={assignment.title}
        placeholder="Title"
        aria-label="Title"
        onChange={(event) => set({ title: event.target.value })}
      />
      <textarea
        className="tb-input tb-text"
        rows={4}
        value={assignment.instructions}
        placeholder="What should learners hand in? You can write Markdown here."
        aria-label="Instructions"
        onChange={(event) => set({ instructions: event.target.value })}
      />
      <div className="tb-row">
        <label className="tb-field">
          Due
          <input
            type="date"
            className="tb-input tb-date"
            value={assignment.due}
            onChange={(event) => set({ due: event.target.value })}
          />
        </label>
        <label className="tb-field">
          <input
            type="checkbox"
            checked={assignment.files}
            onChange={(event) => set({ files: event.target.checked })}
          />
          Learners can add a file
        </label>
        <span className="flex-1" />
        {!graded && (
          <label className="tb-field">
            Points
            <input
              type="number"
              min={0}
              max={1000}
              className="tb-input tb-number"
              value={assignment.points}
              onChange={(event) => set({ points: whole(event.target.value, 0) })}
            />
          </label>
        )}
      </div>
      {graded && (
        <div className="tb-list" ref={rubric}>
          <span className="tb-label">Rubric</span>
          {assignment.rubric.map((row, index) => (
            <div key={index} className="tb-list-row">
              <input
                className="tb-input tb-grow tb-criterion"
                value={row.criterion}
                placeholder={`Criterion ${index + 1}`}
                aria-label={`Criterion ${index + 1}`}
                onChange={(event) => setRow(index, { criterion: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addRow();
                  }
                }}
              />
              <input
                type="number"
                min={0}
                max={1000}
                className="tb-input tb-number"
                value={row.points}
                aria-label={`Points for criterion ${index + 1}`}
                onChange={(event) =>
                  setRow(index, { points: whole(event.target.value, 0) })
                }
              />
              <button
                type="button"
                className="tb-remove"
                aria-label={`Remove criterion ${index + 1}`}
                title="Remove criterion"
                onClick={() =>
                  set({ rubric: assignment.rubric.filter((_, i) => i !== index) })
                }
              >
                <X aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="tb-row">
        <button type="button" className="tb-button" onClick={addRow}>
          <Plus aria-hidden />
          {graded ? "Add criterion" : "Add a rubric"}
        </button>
      </div>
    </Frame>
  );
}
