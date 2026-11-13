import { describe, expect, it } from "vitest";
import {
  matchFence,
  newQuiz,
  newSource,
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
  TUTORIAL_KINDS,
  videoSource,
  writeAssignment,
  writeBlanks,
  writeCompare,
  writeExercise,
  writeFlashcards,
  writeGoals,
  writeOrder,
  writeQuiz,
  writeTerms,
  writeVideo,
} from "./blocks";

describe("quiz", () => {
  it("reads the YAML of a fence", () => {
    const quiz = readQuiz(
      "question: Pick two\noptions: [A, B, 3]\nanswer: [3, 1, 9]\npoints: 4\n",
    );
    expect(quiz).toEqual({
      id: "",
      question: "Pick two",
      options: ["A", "B", "3"],
      answer: [1, 3],
      points: 4,
      attempts: 0,
      explanation: "",
    });
  });

  it("is not a quiz when the YAML is not a mapping or doesn't parse", () => {
    expect(readQuiz("- a\n- b")).toBeNull();
    expect(readQuiz("question: [")).toBeNull();
    expect(readQuiz("")).toBeNull();
  });

  it("writes what it read, and keeps keys it doesn't know", () => {
    const source =
      "question: Why?\noptions:\n  - Yes\n  - No\nanswer: 1\nshuffle: true";
    const quiz = readQuiz(source)!;
    const written = writeQuiz({ ...quiz, question: "Why not?" }, source);
    expect(written).toContain("question: Why not?");
    expect(written).toContain("shuffle: true");
    expect(readQuiz(written)).toEqual({ ...quiz, question: "Why not?" });
  });

  it("starts with an id, two options and two attempts", () => {
    const quiz = newQuiz();
    expect(quiz.id).toMatch(/^[a-z0-9]{6}$/);
    expect(readQuiz(writeQuiz(quiz))).toEqual(quiz);
  });
});

describe("assignment", () => {
  it("reads a due date written with or without quotes", () => {
    expect(readAssignment("title: T\ndue: 2026-11-25")!.due).toBe("2026-11-25");
    expect(readAssignment('title: T\ndue: "2026-11-25"')!.due).toBe("2026-11-25");
    expect(readAssignment("title: T\ndue: soon")!.due).toBe("");
  });

  it("writes what it read", () => {
    const assignment = {
      id: "a1",
      title: "Plan your pilot",
      instructions: "One page.\n\n- Who\n- When",
      points: 10,
      due: "2026-12-01",
      rubric: [],
      files: false,
    };
    expect(readAssignment(writeAssignment(assignment))).toEqual(assignment);
  });

  it("takes its points from the rubric, and writes files only when they are on", () => {
    const source =
      "title: T\npoints: 3\nrubric:\n  - criterion: One thing per item\n    points: 3\n  - criterion: No leading wording\n    points: 2\nfiles: true";
    const assignment = readAssignment(source)!;
    expect(assignment.points).toBe(5);
    expect(assignment.files).toBe(true);
    const written = writeAssignment({ ...assignment, files: false }, source);
    expect(written).toContain("points: 5");
    expect(written).not.toContain("files");
    expect(writeAssignment({ ...assignment, rubric: [] }, source)).not.toContain(
      "rubric",
    );
  });
});

describe("the other tutorial blocks", () => {
  it("read their YAML and write it back", () => {
    const goals = { items: ["Spot a leading question", "Rewrite a vague item"] };
    expect(readGoals(writeGoals(goals))).toEqual(goals);
    const terms = {
      terms: [{ term: "Pilot", definition: "A small trial run: test it first." }],
    };
    expect(readTerms(writeTerms(terms))).toEqual(terms);
    const video = { url: "https://youtu.be/dQw4w9WgXcQ", title: "Spotting problems" };
    expect(readVideo(writeVideo(video))).toEqual(video);
    const compare = {
      before: "Do you exercise regularly?",
      after: "On how many days…\n\n- did you",
    };
    expect(readCompare(writeCompare(compare))).toEqual(compare);
    const blanks = {
      id: "b1",
      text: "A {{leading}} question. A {{pilot|pilot study}}.",
    };
    expect(readBlanks(writeBlanks(blanks))).toEqual(blanks);
    const order = {
      id: "o1",
      prompt: "Order the steps",
      items: ["Draft", "Pilot", "Field"],
    };
    expect(readOrder(writeOrder(order))).toEqual(order);
    const exercise = {
      id: "e1",
      prompt: "Rewrite it.",
      hint: "Which days?",
      answer: "In the past week…",
    };
    expect(readExercise(writeExercise(exercise))).toEqual(exercise);
    const flashcards = {
      cards: [{ front: "Recall period", back: "The time a question asks about" }],
    };
    expect(readFlashcards(writeFlashcards(flashcards))).toEqual(flashcards);
  });

  it("are not the block without the key that makes them one", () => {
    expect(readGoals("title: Goals")).toBeNull();
    expect(readTerms("terms: none")).toBeNull();
    expect(readVideo("title: A video")).toBeNull();
    expect(readCompare("before: Only one side")).toBeNull();
    expect(readBlanks("id: b")).toBeNull();
    expect(readOrder("prompt: Order")).toBeNull();
    expect(readExercise("hint: A hint")).toBeNull();
    expect(readFlashcards("cards: 3")).toBeNull();
  });

  it("start as a block that reads", () => {
    for (const kind of TUTORIAL_KINDS) {
      expect(
        matchFence(kind, `\`\`\`${kind}\n${newSource(kind)}\n\`\`\``),
      ).not.toBeNull();
    }
  });
});

describe("splitBlanks", () => {
  it("takes the gaps out of the text, with every answer a gap accepts", () => {
    expect(
      splitBlanks("A {{leading}} question and a {{ pilot | pilot study }}."),
    ).toEqual({
      parts: ["A ", " question and a ", "."],
      gaps: [{ answers: ["leading"] }, { answers: ["pilot", "pilot study"] }],
    });
  });

  it("leaves an empty gap as text", () => {
    expect(splitBlanks("An {{}} gap")).toEqual({ parts: ["An {{}} gap"], gaps: [] });
  });
});

describe("videoSource", () => {
  it("reads YouTube and Vimeo links and video files", () => {
    expect(videoSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toEqual({
      kind: "youtube",
      id: "dQw4w9WgXcQ",
    });
    expect(videoSource("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      kind: "youtube",
      id: "dQw4w9WgXcQ",
    });
    expect(videoSource("https://vimeo.com/76979871")).toEqual({
      kind: "vimeo",
      id: "76979871",
    });
    expect(videoSource("https://example.org/media/intro.mp4")).toEqual({
      kind: "file",
      url: "https://example.org/media/intro.mp4",
    });
  });

  it("is nothing for other links", () => {
    expect(videoSource("http://example.org/intro.mp4")).toBeNull();
    expect(videoSource("https://example.org/page")).toBeNull();
    expect(videoSource("javascript:alert(1)")).toBeNull();
    expect(videoSource("not a link")).toBeNull();
  });
});

describe("matchFence", () => {
  it("takes the fence and leaves what follows", () => {
    const fence = matchFence("quiz", "```quiz\nquestion: Q\n```\n\nText");
    expect(fence).toEqual({
      raw: "```quiz\nquestion: Q\n```\n",
      source: "question: Q",
    });
  });

  it("needs the closing fence at the start of a line", () => {
    expect(matchFence("quiz", "```quiz\nquestion: Q ```")).toBeNull();
    expect(matchFence("assignment", "```quiz\nquestion: Q\n```")).toBeNull();
  });
});
