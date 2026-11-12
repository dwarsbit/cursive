import { describe, expect, it } from "vitest";
import {
  matchFence,
  newQuiz,
  readAssignment,
  readQuiz,
  writeAssignment,
  writeQuiz,
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
    };
    expect(readAssignment(writeAssignment(assignment))).toEqual(assignment);
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
