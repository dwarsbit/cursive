import { isMap, parseDocument, stringify } from "yaml";

/**
 * The tutorial blocks: a quiz and an assignment. In Markdown each is a
 * fenced block named after it with YAML inside, so other tools show it
 * as code. The server reads the same YAML when it publishes a site
 * (dwarsbit/polemic-server, apps/api/src/sites/learn.ts).
 */
export interface Quiz {
  /** Names the quiz in a learner's progress; unique on its page. */
  id: string;
  question: string;
  options: string[];
  /** The correct options, counted from 1. More than one: learners tick boxes. */
  answer: number[];
  points: number;
  /** How often a learner may check an answer; 0 is as often as they like. */
  attempts: number;
  /** Shown once the quiz is answered. */
  explanation: string;
}

export interface Assignment {
  id: string;
  title: string;
  /** What to hand in, as Markdown. */
  instructions: string;
  points: number;
  /** The day it is due, as YYYY-MM-DD, or empty. */
  due: string;
}

export type TutorialKind = "quiz" | "assignment";

const text = (value: unknown): string =>
  typeof value === "string"
    ? value
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : "";

const count = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(Math.round(value), 1000)
    : fallback;

/** The YAML as a plain mapping, or null when it is something else. */
function mapping(source: string): Record<string, unknown> | null {
  try {
    const doc = parseDocument(source);
    if (doc.errors.length > 0 || !isMap(doc.contents)) return null;
    return doc.toJS() as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** A day as YYYY-MM-DD: YAML reads an unquoted date as a date. */
function day(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const written = text(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(written) ? written : "";
}

/** Reads a quiz fence's YAML; null when it isn't a mapping. */
export function readQuiz(source: string): Quiz | null {
  const data = mapping(source);
  if (!data) return null;
  const options = Array.isArray(data.options) ? data.options.map(text) : [];
  const answers = Array.isArray(data.answer) ? data.answer : [data.answer];
  const answer = [
    ...new Set(
      answers.filter(
        (n): n is number =>
          typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= options.length,
      ),
    ),
  ].sort((a, b) => a - b);
  return {
    id: text(data.id),
    question: text(data.question),
    options,
    answer,
    points: count(data.points, 1),
    attempts: count(data.attempts, 0),
    explanation: text(data.explanation),
  };
}

/** Reads an assignment fence's YAML; null when it isn't a mapping. */
export function readAssignment(source: string): Assignment | null {
  const data = mapping(source);
  if (!data) return null;
  return {
    id: text(data.id),
    title: text(data.title),
    instructions: text(data.instructions),
    points: count(data.points, 0),
    due: day(data.due),
  };
}

/** Writes YAML with the block's own keys first and any other keys of `previous` after them. */
function write(known: Record<string, unknown>, previous: string): string {
  const rest = mapping(previous) ?? {};
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(known)) {
    if (value !== undefined) merged[key] = value;
  }
  for (const [key, value] of Object.entries(rest)) {
    if (!(key in known)) merged[key] = value;
  }
  return stringify(merged, { lineWidth: 0 }).trimEnd();
}

export function writeQuiz(quiz: Quiz, previous = ""): string {
  return write(
    {
      id: quiz.id || undefined,
      question: quiz.question,
      options: quiz.options,
      answer: quiz.answer.length === 1 ? quiz.answer[0] : quiz.answer,
      points: quiz.points,
      attempts: quiz.attempts > 0 ? quiz.attempts : undefined,
      explanation: quiz.explanation || undefined,
    },
    previous,
  );
}

export function writeAssignment(assignment: Assignment, previous = ""): string {
  return write(
    {
      id: assignment.id || undefined,
      title: assignment.title,
      instructions: assignment.instructions,
      points: assignment.points,
      due: assignment.due || undefined,
    },
    previous,
  );
}

/** A short name for a new block: unique enough on one page. */
export function newId(random: () => number = Math.random): string {
  const letters = "abcdefghijkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += letters[Math.floor(random() * letters.length)];
  return id;
}

export const newQuiz = (): Quiz => ({
  id: newId(),
  question: "",
  options: ["", ""],
  answer: [1],
  points: 1,
  attempts: 2,
  explanation: "",
});

export const newAssignment = (): Assignment => ({
  id: newId(),
  title: "",
  instructions: "",
  points: 10,
  due: "",
});

const FENCE: Record<TutorialKind, RegExp> = {
  quiz: /^(`{3,})quiz[ \t]*\n([\s\S]*?)(?<=\n)\1[ \t]*(?:\n|$)/,
  assignment: /^(`{3,})assignment[ \t]*\n([\s\S]*?)(?<=\n)\1[ \t]*(?:\n|$)/,
};

/**
 * The fence at the start of `src`, when its YAML reads as the block.
 * Anything else stays a code block.
 */
export function matchFence(
  kind: TutorialKind,
  src: string,
): { raw: string; source: string } | null {
  const match = FENCE[kind].exec(src);
  if (!match) return null;
  const source = match[2].replace(/\n$/, "");
  const read = kind === "quiz" ? readQuiz(source) : readAssignment(source);
  return read ? { raw: match[0], source } : null;
}

export const toFence = (kind: TutorialKind, source: string): string =>
  `\`\`\`${kind}\n${source.replace(/\s+$/, "")}\n\`\`\``;
