import { isMap, parseDocument, stringify } from "yaml";

/**
 * The tutorial blocks. In Markdown each is a fenced block named after it
 * with YAML inside, so other tools show it as code. The server reads the
 * same YAML when it publishes a site (dwarsbit/polemic-server,
 * apps/api/src/sites/learn.ts).
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

export interface Criterion {
  criterion: string;
  points: number;
}

export interface Assignment {
  id: string;
  title: string;
  /** What to hand in, as Markdown. */
  instructions: string;
  /** With a rubric, the sum of its points. */
  points: number;
  /** The day it is due, as YYYY-MM-DD, or empty. */
  due: string;
  /** What the work is graded on. Empty: one grade for the whole. */
  rubric: Criterion[];
  /** Whether learners can add a file to their work. */
  files: boolean;
}

/** What a learner can do after the page. */
export interface Goals {
  items: string[];
}

export interface Term {
  term: string;
  definition: string;
}

/** Terms with their definitions. A published page also explains them where its text uses them. */
export interface Terms {
  terms: Term[];
}

export interface Video {
  /** A YouTube or Vimeo page, or a video file. */
  url: string;
  title: string;
}

/** A weak version next to a better one, both Markdown. */
export interface Compare {
  before: string;
  after: string;
}

/** A text with gaps: each gap is written {{answer}}, or {{answer|another answer}}. */
export interface Blanks {
  id: string;
  text: string;
}

/** Items to put in order, written in the correct order. */
export interface Order {
  id: string;
  prompt: string;
  items: string[];
}

/** An open question to practice on, with a hint and a model answer to reveal. */
export interface Exercise {
  id: string;
  prompt: string;
  hint: string;
  answer: string;
}

export interface Card {
  front: string;
  back: string;
}

export interface Flashcards {
  cards: Card[];
}

export const TUTORIAL_KINDS = [
  "quiz",
  "assignment",
  "goals",
  "terms",
  "video",
  "compare",
  "blanks",
  "order",
  "exercise",
  "flashcards",
] as const;
export type TutorialKind = (typeof TUTORIAL_KINDS)[number];

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
  const rubric = list(data.rubric).map((entry) => ({
    criterion: text(record(entry).criterion),
    points: count(record(entry).points, 0),
  }));
  return {
    id: text(data.id),
    title: text(data.title),
    instructions: text(data.instructions),
    points: rubric.length
      ? rubric.reduce((sum, row) => sum + row.points, 0)
      : count(data.points, 0),
    due: day(data.due),
    rubric,
    files: data.files === true,
  };
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Reads a goals fence's YAML; null when it has no list of items. */
export function readGoals(source: string): Goals | null {
  const data = mapping(source);
  if (!data || !Array.isArray(data.items)) return null;
  return { items: data.items.map(text) };
}

export function readTerms(source: string): Terms | null {
  const data = mapping(source);
  if (!data || !Array.isArray(data.terms)) return null;
  return {
    terms: data.terms.map((entry) => ({
      term: text(record(entry).term),
      definition: text(record(entry).definition),
    })),
  };
}

export function readVideo(source: string): Video | null {
  const data = mapping(source);
  if (!data || typeof data.url !== "string") return null;
  return { url: data.url.trim(), title: text(data.title) };
}

export function readCompare(source: string): Compare | null {
  const data = mapping(source);
  if (!data || !("before" in data) || !("after" in data)) return null;
  return { before: text(data.before), after: text(data.after) };
}

export function readBlanks(source: string): Blanks | null {
  const data = mapping(source);
  if (!data || typeof data.text !== "string") return null;
  return { id: text(data.id), text: data.text };
}

export function readOrder(source: string): Order | null {
  const data = mapping(source);
  if (!data || !Array.isArray(data.items)) return null;
  return { id: text(data.id), prompt: text(data.prompt), items: data.items.map(text) };
}

export function readExercise(source: string): Exercise | null {
  const data = mapping(source);
  if (!data || !("prompt" in data)) return null;
  return {
    id: text(data.id),
    prompt: text(data.prompt),
    hint: text(data.hint),
    answer: text(data.answer),
  };
}

export function readFlashcards(source: string): Flashcards | null {
  const data = mapping(source);
  if (!data || !Array.isArray(data.cards)) return null;
  return {
    cards: data.cards.map((entry) => ({
      front: text(record(entry).front),
      back: text(record(entry).back),
    })),
  };
}

/** How a published page shows a video: an embedded player, or the file itself. */
export type VideoSource =
  { kind: "youtube" | "vimeo"; id: string } | { kind: "file"; url: string };

/** What a video's address points at, or null when it is not a video Cursive can show. */
export function videoSource(address: string): VideoSource | null {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");
  const id = /^[A-Za-z0-9_-]{6,20}$/;
  if (host === "youtu.be") {
    const found = url.pathname.slice(1);
    return id.test(found) ? { kind: "youtube", id: found } : null;
  }
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    const found =
      url.pathname === "/watch"
        ? (url.searchParams.get("v") ?? "")
        : (/^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname)?.[1] ?? "");
    return id.test(found) ? { kind: "youtube", id: found } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const found = /^\/(?:video\/)?(\d{4,12})(?:\/|$)/.exec(url.pathname)?.[1];
    return found ? { kind: "vimeo", id: found } : null;
  }
  return /\.(?:mp4|webm|ogv|mov|m4v)$/i.test(url.pathname)
    ? { kind: "file", url: url.href }
    : null;
}

/** A gap of a blanks text: what a learner may write in it. */
export interface Gap {
  answers: string[];
}

/** A blanks text as the words around its gaps and the gaps between them. */
export function splitBlanks(source: string): { parts: string[]; gaps: Gap[] } {
  const parts: string[] = [];
  const gaps: Gap[] = [];
  let at = 0;
  for (const match of source.matchAll(/\{\{([^{}]*)\}\}/g)) {
    const answers = match[1]
      .split("|")
      .map((answer) => answer.trim())
      .filter(Boolean);
    if (answers.length === 0) continue;
    parts.push(source.slice(at, match.index));
    gaps.push({ answers });
    at = match.index + match[0].length;
  }
  parts.push(source.slice(at));
  return { parts, gaps };
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
      points: assignment.rubric.length
        ? assignment.rubric.reduce((sum, row) => sum + row.points, 0)
        : assignment.points,
      due: assignment.due || undefined,
      rubric: assignment.rubric.length ? assignment.rubric : undefined,
      files: assignment.files ? true : undefined,
    },
    previous,
  );
}

export const writeGoals = (goals: Goals, previous = ""): string =>
  write({ items: goals.items }, previous);

export const writeTerms = (terms: Terms, previous = ""): string =>
  write({ terms: terms.terms }, previous);

export const writeVideo = (video: Video, previous = ""): string =>
  write({ url: video.url, title: video.title || undefined }, previous);

export const writeCompare = (compare: Compare, previous = ""): string =>
  write({ before: compare.before, after: compare.after }, previous);

export const writeBlanks = (blanks: Blanks, previous = ""): string =>
  write({ id: blanks.id || undefined, text: blanks.text }, previous);

export const writeOrder = (order: Order, previous = ""): string =>
  write(
    {
      id: order.id || undefined,
      prompt: order.prompt || undefined,
      items: order.items,
    },
    previous,
  );

export const writeExercise = (exercise: Exercise, previous = ""): string =>
  write(
    {
      id: exercise.id || undefined,
      prompt: exercise.prompt,
      hint: exercise.hint || undefined,
      answer: exercise.answer || undefined,
    },
    previous,
  );

export const writeFlashcards = (flashcards: Flashcards, previous = ""): string =>
  write({ cards: flashcards.cards }, previous);

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
  rubric: [],
  files: false,
});

/** Each block's reader, and the YAML a new one starts with. */
const KINDS: Record<
  TutorialKind,
  { read: (source: string) => unknown; create: () => string }
> = {
  quiz: { read: readQuiz, create: () => writeQuiz(newQuiz()) },
  assignment: { read: readAssignment, create: () => writeAssignment(newAssignment()) },
  goals: { read: readGoals, create: () => writeGoals({ items: [""] }) },
  terms: {
    read: readTerms,
    create: () => writeTerms({ terms: [{ term: "", definition: "" }] }),
  },
  video: { read: readVideo, create: () => writeVideo({ url: "", title: "" }) },
  compare: { read: readCompare, create: () => writeCompare({ before: "", after: "" }) },
  blanks: { read: readBlanks, create: () => writeBlanks({ id: newId(), text: "" }) },
  order: {
    read: readOrder,
    create: () => writeOrder({ id: newId(), prompt: "", items: ["", ""] }),
  },
  exercise: {
    read: readExercise,
    create: () => writeExercise({ id: newId(), prompt: "", hint: "", answer: "" }),
  },
  flashcards: {
    read: readFlashcards,
    create: () => writeFlashcards({ cards: [{ front: "", back: "" }] }),
  },
};

/** The YAML of a new, empty block. */
export const newSource = (kind: TutorialKind): string => KINDS[kind].create();

const fence = (kind: TutorialKind) =>
  new RegExp(`^(\`{3,})${kind}[ \\t]*\\n([\\s\\S]*?)(?<=\\n)\\1[ \\t]*(?:\\n|$)`);

/**
 * The fence at the start of `src`, when its YAML reads as the block.
 * Anything else stays a code block.
 */
export function matchFence(
  kind: TutorialKind,
  src: string,
): { raw: string; source: string } | null {
  const match = fence(kind).exec(src);
  if (!match) return null;
  const source = match[2].replace(/\n$/, "");
  return KINDS[kind].read(source) ? { raw: match[0], source } : null;
}

export const toFence = (kind: TutorialKind, source: string): string =>
  `\`\`\`${kind}\n${source.replace(/\s+$/, "")}\n\`\`\``;
