import { beforeEach, describe, expect, it, vi } from "vitest";

type QuestionRow = {
  id: string;
  name: string;
  question: string;
  created_at: string;
  updated_at: string;
};

type ChoiceRow = {
  id: string;
  question_id: string;
  label: string;
  is_correct: number;
  position: number;
};

const { mockDb } = vi.hoisted(() => {
  const questions: QuestionRow[] = [];
  const choices: ChoiceRow[] = [];
  const calls: { sql: string; binds: unknown[] }[] = [];
  let clock = 0;

  function nextTimestamp() {
    clock += 1;
    return `2026-09-04T00:00:0${clock}.000Z`;
  }

  function applyWrite(sql: string, binds: unknown[]) {
    const insert = sql.match(
      /INSERT INTO (questions|choices) \(([^)]+)\) VALUES \(([^)]+)\)/i,
    );
    if (insert) {
      const table = insert[1].toLowerCase();
      const columns = insert[2].split(",").map((part) => part.trim());
      const placeholders = insert[3].split(",").map((part) => part.trim());
      const row: Record<string, string | number> = {};

      columns.forEach((column, index) => {
        const placeholder = placeholders[index];
        const bindIndex = Number(placeholder.replace("?", "")) - 1;
        row[column] = binds[bindIndex] as string | number;
      });

      if (table === "questions") {
        const timestamp = nextTimestamp();
        questions.push({
          id: String(row.id ?? crypto.randomUUID()),
          name: String(row.name),
          question: String(row.question),
          created_at: String(row.created_at ?? timestamp),
          updated_at: String(row.updated_at ?? timestamp),
        });
        return;
      }

      choices.push({
        id: String(row.id ?? crypto.randomUUID()),
        question_id: String(row.question_id),
        label: String(row.label),
        is_correct: Number(row.is_correct),
        position: Number(row.position),
      });
      return;
    }

    const update = sql.match(/UPDATE questions SET (.+) WHERE id = \?(\d+)/i);
    if (update) {
      const id = binds[Number(update[2]) - 1];
      const row = questions.find((existing) => existing.id === id);
      if (!row) {
        return;
      }

      for (const assignment of update[1].split(",").map((part) => part.trim())) {
        const matched = assignment.match(/^(\w+)\s*=\s*\?(\d+)$/i);
        if (!matched) {
          continue;
        }

        const column = matched[1];
        const value = binds[Number(matched[2]) - 1];
        if (column === "name") {
          row.name = String(value);
        }
        if (column === "question") {
          row.question = String(value);
        }
        if (column === "updated_at") {
          row.updated_at = String(value);
        }
      }
      row.updated_at = nextTimestamp();
      return;
    }

    const deleteChoices = sql.match(
      /DELETE FROM choices WHERE question_id = \?(\d+)/i,
    );
    if (deleteChoices) {
      const questionId = binds[Number(deleteChoices[1]) - 1];
      for (let index = choices.length - 1; index >= 0; index -= 1) {
        if (choices[index]?.question_id === questionId) {
          choices.splice(index, 1);
        }
      }
      return;
    }

    const deleteQuestion = sql.match(/DELETE FROM questions WHERE id = \?(\d+)/i);
    if (deleteQuestion) {
      const id = binds[Number(deleteQuestion[1]) - 1];
      const index = questions.findIndex((existing) => existing.id === id);
      if (index >= 0) {
        questions.splice(index, 1);
      }
      for (let choiceIndex = choices.length - 1; choiceIndex >= 0; choiceIndex -= 1) {
        if (choices[choiceIndex]?.question_id === id) {
          choices.splice(choiceIndex, 1);
        }
      }
    }
  }

  function applyRead(sql: string, binds: unknown[]) {
    if (/FROM choices/i.test(sql)) {
      const byQuestion = sql.match(/question_id = \?(\d+)/i);
      let results = [...choices];
      if (byQuestion) {
        const questionId = binds[Number(byQuestion[1]) - 1];
        results = results.filter((row) => row.question_id === questionId);
      }
      if (/ORDER BY position/i.test(sql)) {
        results.sort((left, right) => left.position - right.position);
      }
      return results;
    }

    if (/FROM questions/i.test(sql)) {
      const byId = sql.match(/WHERE id = \?(\d+)/i);
      let results = [...questions];
      if (byId) {
        const id = binds[Number(byId[1]) - 1];
        results = results.filter((row) => row.id === id);
      }
      if (/ORDER BY created_at DESC/i.test(sql)) {
        results.sort((left, right) =>
          right.created_at.localeCompare(left.created_at),
        );
      }
      return results;
    }

    return [];
  }

  return {
    mockDb: {
      questions,
      choices,
      calls,
      reset() {
        questions.length = 0;
        choices.length = 0;
        calls.length = 0;
        clock = 0;
      },
      prepare(sql: string) {
        let binds: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            binds = values;
            return statement;
          },
          async run() {
            calls.push({ sql, binds });
            applyWrite(sql, binds);
            return { success: true };
          },
          async all() {
            calls.push({ sql, binds });
            return { results: applyRead(sql, binds) };
          },
        };
        return statement;
      },
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { DB: mockDb },
  })),
}));

import {
  createQuestion,
  deleteQuestion,
  getQuestionById,
  listQuestions,
  QuestionNotFoundError,
  QuestionValidationError,
  updateQuestion,
} from "@/lib/services/question";

const twoChoices = [
  { label: "Control what enters and leaves the cell", isCorrect: true },
  { label: "Store genetic material", isCorrect: false },
];

const validInput = {
  name: "Cell membrane",
  question: "What is the main function of the cell membrane?",
  choices: twoChoices,
};

describe("createQuestion", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("stores a trimmed name and question", async () => {
    await createQuestion({
      name: "  Cell membrane  ",
      question: "  What is the main function of the cell membrane?  ",
      choices: twoChoices,
    });

    expect(mockDb.questions).toHaveLength(1);
    expect(mockDb.questions[0]?.name).toBe("Cell membrane");
    expect(mockDb.questions[0]?.question).toBe(
      "What is the main function of the cell membrane?",
    );
  });

  it("stores two choices linked to the new question id", async () => {
    const created = await createQuestion(validInput);

    expect(mockDb.choices).toHaveLength(2);
    expect(mockDb.choices.every((row) => row.question_id === created.id)).toBe(
      true,
    );
    expect(mockDb.choices.map((row) => row.label)).toEqual([
      "Control what enters and leaves the cell",
      "Store genetic material",
    ]);
  });

  it("stores is_correct as 0 or 1 and exposes isCorrect as a boolean", async () => {
    const created = await createQuestion(validInput);

    expect(mockDb.choices.map((row) => row.is_correct).sort()).toEqual([0, 1]);
    expect(created.choices[0]?.isCorrect).toBe(true);
    expect(created.choices[1]?.isCorrect).toBe(false);
    expect(typeof created.choices[0]?.isCorrect).toBe("boolean");
    expect(typeof created.choices[1]?.isCorrect).toBe("boolean");
  });

  it("fails validation when there is only one choice", async () => {
    await expect(
      createQuestion({
        ...validInput,
        choices: [{ label: "Only one", isCorrect: true }],
      }),
    ).rejects.toBeInstanceOf(QuestionValidationError);
  });

  it("fails validation when there are seven choices", async () => {
    await expect(
      createQuestion({
        ...validInput,
        choices: [
          { label: "One", isCorrect: true },
          { label: "Two", isCorrect: false },
          { label: "Three", isCorrect: false },
          { label: "Four", isCorrect: false },
          { label: "Five", isCorrect: false },
          { label: "Six", isCorrect: false },
          { label: "Seven", isCorrect: false },
        ],
      }),
    ).rejects.toBeInstanceOf(QuestionValidationError);
  });

  it("fails validation when no choice is correct", async () => {
    await expect(
      createQuestion({
        ...validInput,
        choices: [
          { label: "One", isCorrect: false },
          { label: "Two", isCorrect: false },
        ],
      }),
    ).rejects.toBeInstanceOf(QuestionValidationError);
  });

  it("fails validation when two choices are correct", async () => {
    await expect(
      createQuestion({
        ...validInput,
        choices: [
          { label: "One", isCorrect: true },
          { label: "Two", isCorrect: true },
        ],
      }),
    ).rejects.toBeInstanceOf(QuestionValidationError);
  });

  it("fails validation when the name, question, or a choice label is blank", async () => {
    await expect(
      createQuestion({ ...validInput, name: "" }),
    ).rejects.toBeInstanceOf(QuestionValidationError);
    await expect(
      createQuestion({ ...validInput, name: "   " }),
    ).rejects.toBeInstanceOf(QuestionValidationError);
    await expect(
      createQuestion({ ...validInput, question: "" }),
    ).rejects.toBeInstanceOf(QuestionValidationError);
    await expect(
      createQuestion({
        ...validInput,
        choices: [
          { label: "   ", isCorrect: true },
          { label: "Store genetic material", isCorrect: false },
        ],
      }),
    ).rejects.toBeInstanceOf(QuestionValidationError);
  });
});

describe("listQuestions", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("returns created questions without choice arrays", async () => {
    await createQuestion(validInput);
    await createQuestion({
      name: "Mitochondria",
      question: "What is the powerhouse of the cell?",
      choices: [
        { label: "Mitochondrion", isCorrect: true },
        { label: "Nucleus", isCorrect: false },
      ],
    });

    const listed = await listQuestions();

    expect(listed).toHaveLength(2);
    expect(listed[0]?.name).toBe("Mitochondria");
    expect(listed[1]?.name).toBe("Cell membrane");
    for (const question of listed) {
      expect(question).not.toHaveProperty("choices");
      expect(question.name).toBeDefined();
      expect(question.question).toBeDefined();
    }
  });
});

describe("getQuestionById", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("returns the question and choices in position order", async () => {
    const created = await createQuestion({
      ...validInput,
      choices: [
        { label: "First", isCorrect: false },
        { label: "Second", isCorrect: true },
        { label: "Third", isCorrect: false },
      ],
    });

    const found = await getQuestionById(created.id);

    expect(found?.name).toBe("Cell membrane");
    expect(found?.choices.map((choice) => choice.label)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(found?.choices.map((choice) => choice.position)).toEqual([1, 2, 3]);
  });

  it("returns null for an unknown id", async () => {
    await expect(getQuestionById("missing-id")).resolves.toBeNull();
  });
});

describe("updateQuestion", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("replaces the name, stem, and the full choice set", async () => {
    const created = await createQuestion(validInput);

    const updated = await updateQuestion(created.id, {
      name: "Updated name",
      question: "Updated stem?",
      choices: [
        { label: "New A", isCorrect: false },
        { label: "New B", isCorrect: true },
        { label: "New C", isCorrect: false },
      ],
    });

    expect(updated.name).toBe("Updated name");
    expect(updated.question).toBe("Updated stem?");
    expect(updated.choices).toHaveLength(3);
    expect(updated.choices.map((choice) => choice.label)).toEqual([
      "New A",
      "New B",
      "New C",
    ]);
    expect(mockDb.choices).toHaveLength(3);
    expect(mockDb.choices.every((row) => row.question_id === created.id)).toBe(
      true,
    );
  });

  it("fails not-found for an unknown id", async () => {
    await expect(
      updateQuestion("missing-id", validInput),
    ).rejects.toBeInstanceOf(QuestionNotFoundError);
  });
});

describe("deleteQuestion", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("removes the question so a later getQuestionById is empty", async () => {
    const created = await createQuestion(validInput);

    await deleteQuestion(created.id);

    expect(mockDb.questions).toHaveLength(0);
    await expect(getQuestionById(created.id)).resolves.toBeNull();
  });

  it("fails not-found for an unknown id", async () => {
    await expect(deleteQuestion("missing-id")).rejects.toBeInstanceOf(
      QuestionNotFoundError,
    );
  });
});

describe("question service SQL", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("uses numbered bound parameters and does not concatenate user input into SQL", async () => {
    const created = await createQuestion({
      name: "Name'; DROP TABLE questions;--",
      question: "Stem'; DROP TABLE choices;--",
      choices: [
        { label: "Label'; DROP TABLE attempts;--", isCorrect: true },
        { label: "Safe", isCorrect: false },
      ],
    });

    await updateQuestion(created.id, {
      name: "Updated'; DROP TABLE questions;--",
      question: "Updated stem",
      choices: [
        { label: "A", isCorrect: true },
        { label: "B", isCorrect: false },
      ],
    });
    await deleteQuestion(created.id);

    expect(mockDb.calls.length).toBeGreaterThan(0);
    for (const call of mockDb.calls) {
      expect(call.sql).toMatch(/\?1/);
      expect(call.sql).not.toMatch(/\?;/);
      expect(call.sql).not.toContain("DROP TABLE");
      expect(call.sql).not.toContain("Name';");
      expect(call.sql).not.toContain("Stem';");
      expect(call.sql).not.toContain("Label';");
      expect(call.binds.length).toBeGreaterThan(0);
    }
  });
});
