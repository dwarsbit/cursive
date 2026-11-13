/**
 * Project templates: pages a new project can start with. Each template
 * is a folder of Markdown files next to this file, laid out as the
 * project will be, so a template is edited like any project.
 * `{{today}}` in a page becomes the day the project is made.
 */
export type TemplateKind = "notes" | "presentation" | "tutorial";

export interface Template {
  /** The name of its folder. */
  id: string;
  name: string;
  kind: TemplateKind;
  description: string;
}

export const TEMPLATE_KINDS: Array<{ id: TemplateKind; label: string }> = [
  { id: "notes", label: "Notes" },
  { id: "presentation", label: "Presentation" },
  { id: "tutorial", label: "Tutorial" },
];

export const TEMPLATES: Template[] = [
  {
    id: "lecture-notes",
    name: "Lecture notes",
    kind: "notes",
    description:
      "A page per lecture with key concepts, a numbered equation, a summary and open questions.",
  },
  {
    id: "lab-report",
    name: "Lab report",
    kind: "notes",
    description:
      "Aim, theory, method, results in a numbered table, discussion and references.",
  },
  {
    id: "literature-review",
    name: "Literature review",
    kind: "notes",
    description:
      "A page per source with its citation and summary, linked to theme pages and a synthesis.",
  },
  {
    id: "research-paper",
    name: "Research paper",
    kind: "notes",
    description:
      "Abstract, introduction, method, results and discussion, with a footnote and a reference list.",
  },
  {
    id: "thesis-outline",
    name: "Thesis outline",
    kind: "notes",
    description:
      "A page per chapter, a plan with your research question and planning, and meeting notes.",
  },
  {
    id: "reading-notes",
    name: "Reading notes",
    kind: "notes",
    description:
      "A page per book or article with its citation, key arguments, quotes and your response.",
  },
  {
    id: "conference-talk",
    name: "Conference talk",
    kind: "presentation",
    description:
      "Title, motivation, method, result, conclusion and references, with speaker notes.",
  },
  {
    id: "lecture-slides",
    name: "Lecture slides",
    kind: "presentation",
    description:
      "Learning goals, content slides with an equation, a question for the room, a recap and reading.",
  },
  {
    id: "thesis-defense",
    name: "Thesis defense",
    kind: "presentation",
    description:
      "Research question, contribution, method, findings, limitations and backup slides.",
  },
  {
    id: "course-module",
    name: "Course module",
    kind: "tutorial",
    description:
      "Learning goals, two lessons with an exercise and a quiz, and a final assignment with a rubric.",
  },
];

const FILES = import.meta.glob<string>("./*/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** A day as YYYY-MM-DD, in the reader's own time zone. */
const dayOf = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

/** A template's pages by their path in the new project. */
export function templatePages(id: string, today = new Date()): Record<string, string> {
  const prefix = `./${id}/`;
  const day = dayOf(today);
  return Object.fromEntries(
    Object.entries(FILES)
      .filter(([file]) => file.startsWith(prefix))
      .map(([file, source]) => [
        file.slice(prefix.length),
        source.split("{{today}}").join(day),
      ]),
  );
}
