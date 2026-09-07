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

type AttemptRow = {
  id: string;
  question_id: string;
  choice_id: string;
  user_id: string | null;
  is_correct: number;
  created_at: string;
};

const { mockDb } = vi.hoisted(() => {
  const questions: QuestionRow[] = [];
  const choices: ChoiceRow[] = [];
  const attempts: AttemptRow[] = [];
  const calls: { sql: string; binds: unknown[] }[] = [];
  let clock = 0;

  function nextTimestamp() {
    clock += 1;
    return `2026-09-04T00:00:0${clock}.000Z`;
  }

  function applyWrite(sql: string, binds: unknown[]) {
    const insert = sql.match(
      /INSERT INTO (questions|choices|attempts) \(([^)]+)\) VALUES \(([^)]+)\)/i,
    );
    if (insert) {
      const table = insert[1].toLowerCase();
      const columns = insert[2].split(",").map((part) => part.trim());
      const placeholders = insert[3].split(",").map((part) => part.trim());
      const row: Record<string, string | number | null> = {};

      columns.forEach((column, index) => {
        const placeholder = placeholders[index];
        const bindIndex = Number(placeholder.replace("?", "")) - 1;
        row[column] = binds[bindIndex] as string | number | null;
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

      if (table === "choices") {
        choices.push({
          id: String(row.id ?? crypto.randomUUID()),
          question_id: String(row.question_id),
          label: String(row.label),
          is_correct: Number(row.is_correct),
          position: Number(row.position),
        });
        return;
      }

      attempts.push({
        id: String(row.id ?? crypto.randomUUID()),
        question_id: String(row.question_id),
        choice_id: String(row.choice_id),
        user_id: row.user_id == null ? null : String(row.user_id),
        is_correct: Number(row.is_correct),
        created_at: String(row.created_at ?? nextTimestamp()),
      });
      return;
    }
  }

  function applyRead(sql: string, binds: unknown[]) {
    if (/FROM attempts/i.test(sql)) {
      const byQuestion = sql.match(/question_id = \?(\d+)/i);
      const byId = sql.match(/WHERE id = \?(\d+)/i);
      let results = [...attempts];
      if (byQuestion) {
        const questionId = binds[Number(byQuestion[1]) - 1];
        results = results.filter((row) => row.question_id === questionId);
      } else if (byId) {
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

    if (/FROM choices/i.test(sql)) {
      const byQuestion = sql.match(/question_id = \?(\d+)/i);
      const byId = sql.match(/WHERE id = \?(\d+)/i);
      let results = [...choices];
      if (byQuestion) {
        const questionId = binds[Number(byQuestion[1]) - 1];
        results = results.filter((row) => row.question_id === questionId);
      } else if (byId) {
        const id = binds[Number(byId[1]) - 1];
        results = results.filter((row) => row.id === id);
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
      return results;
    }

    return [];
  }

  return {
    mockDb: {
      questions,
      choices,
      attempts,
      calls,
      reset() {
        questions.length = 0;
        choices.length = 0;
        attempts.length = 0;
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

import { createQuestion } from "@/lib/services/question";
import {
  AttemptValidationError,
  ChoiceNotFoundError,
  createAttempt,
  listAttemptsByQuestionId,
  QuestionNotFoundError,
} from "@/lib/services/attempt";

const questionInput = {
  name: "Cell membrane",
  question: "What is the main function of the cell membrane?",
  choices: [
    { label: "Control what enters and leaves the cell", isCorrect: true },
    { label: "Store genetic material", isCorrect: false },
  ],
};

async function seedQuestion() {
  const created = await createQuestion(questionInput);
  const correct = created.choices.find((choice) => choice.isCorrect);
  const incorrect = created.choices.find((choice) => !choice.isCorrect);
  if (!correct || !incorrect) {
    throw new Error("Expected a correct and an incorrect choice.");
  }
  return { created, correct, incorrect };
}

describe("createAttempt", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("stores isCorrect true when the selected choice is correct", async () => {
    const { created, correct } = await seedQuestion();

    const attempt = await createAttempt({
      questionId: created.id,
      choiceId: correct.id,
    });

    expect(attempt.isCorrect).toBe(true);
    expect(typeof attempt.isCorrect).toBe("boolean");
    expect(mockDb.attempts).toHaveLength(1);
    expect(mockDb.attempts[0]?.is_correct).toBe(1);
    expect(mockDb.attempts[0]?.choice_id).toBe(correct.id);
    expect(mockDb.attempts[0]?.question_id).toBe(created.id);
  });

  it("stores isCorrect false when the selected choice is incorrect", async () => {
    const { created, incorrect } = await seedQuestion();

    const attempt = await createAttempt({
      questionId: created.id,
      choiceId: incorrect.id,
    });

    expect(attempt.isCorrect).toBe(false);
    expect(mockDb.attempts[0]?.is_correct).toBe(0);
  });

  it("ignores a client-supplied isCorrect and uses the stored choice", async () => {
    const { created, incorrect } = await seedQuestion();

    const attempt = await createAttempt({
      questionId: created.id,
      choiceId: incorrect.id,
      isCorrect: true,
    });

    expect(attempt.isCorrect).toBe(false);
    expect(mockDb.attempts[0]?.is_correct).toBe(0);
  });

  it("fails when the choice does not belong to the question", async () => {
    const first = await seedQuestion();
    const other = await createQuestion({
      name: "Mitochondria",
      question: "What is the powerhouse of the cell?",
      choices: [
        { label: "Mitochondrion", isCorrect: true },
        { label: "Nucleus", isCorrect: false },
      ],
    });

    await expect(
      createAttempt({
        questionId: first.created.id,
        choiceId: other.choices[0]?.id ?? "",
      }),
    ).rejects.toBeInstanceOf(AttemptValidationError);
    expect(mockDb.attempts).toHaveLength(0);
  });

  it("fails for an unknown question or choice", async () => {
    const { created, correct } = await seedQuestion();

    await expect(
      createAttempt({
        questionId: "missing-question",
        choiceId: correct.id,
      }),
    ).rejects.toBeInstanceOf(QuestionNotFoundError);

    await expect(
      createAttempt({
        questionId: created.id,
        choiceId: "missing-choice",
      }),
    ).rejects.toBeInstanceOf(ChoiceNotFoundError);
  });

  it("stores optional userId when provided", async () => {
    const { created, correct } = await seedQuestion();

    const attempt = await createAttempt({
      questionId: created.id,
      choiceId: correct.id,
      userId: "teacher-1",
    });

    expect(attempt.userId).toBe("teacher-1");
    expect(mockDb.attempts[0]?.user_id).toBe("teacher-1");
  });
});

describe("listAttemptsByQuestionId", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("returns attempts for that question, newest first", async () => {
    const { created, correct, incorrect } = await seedQuestion();

    await createAttempt({
      questionId: created.id,
      choiceId: incorrect.id,
    });
    const newer = await createAttempt({
      questionId: created.id,
      choiceId: correct.id,
    });

    const listed = await listAttemptsByQuestionId(created.id);

    expect(listed).toHaveLength(2);
    expect(listed[0]?.id).toBe(newer.id);
    expect(listed[0]?.isCorrect).toBe(true);
    expect(listed[1]?.isCorrect).toBe(false);
  });

  it("does not return attempts for a different question", async () => {
    const first = await seedQuestion();
    const other = await createQuestion({
      name: "Mitochondria",
      question: "What is the powerhouse of the cell?",
      choices: [
        { label: "Mitochondrion", isCorrect: true },
        { label: "Nucleus", isCorrect: false },
      ],
    });

    await createAttempt({
      questionId: first.created.id,
      choiceId: first.correct.id,
    });
    await createAttempt({
      questionId: other.id,
      choiceId: other.choices[0]?.id ?? "",
    });

    const listed = await listAttemptsByQuestionId(first.created.id);

    expect(listed).toHaveLength(1);
    expect(listed[0]?.questionId).toBe(first.created.id);
  });
});

describe("attempt service SQL", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("uses numbered bound parameters and does not concatenate user input into SQL", async () => {
    const { created, correct } = await seedQuestion();
    mockDb.calls.length = 0;

    await createAttempt({
      questionId: created.id,
      choiceId: correct.id,
      userId: "user'; DROP TABLE attempts;--",
    });
    await listAttemptsByQuestionId(created.id);

    expect(mockDb.calls.length).toBeGreaterThan(0);
    for (const call of mockDb.calls) {
      expect(call.sql).toMatch(/\?1/);
      expect(call.sql).not.toMatch(/\?;/);
      expect(call.sql).not.toContain("DROP TABLE");
      expect(call.sql).not.toContain(created.id);
      expect(call.sql).not.toContain(correct.id);
      expect(call.binds.length).toBeGreaterThan(0);
    }
  });
});
