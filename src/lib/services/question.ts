import { z } from "zod";
import { getDb } from "@/lib/db";

export class QuestionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionValidationError";
  }
}

export class QuestionNotFoundError extends Error {
  constructor(message = "Question not found.") {
    super(message);
    this.name = "QuestionNotFoundError";
  }
}

export type ChoiceRecord = {
  id: string;
  label: string;
  isCorrect: boolean;
  position: number;
};

export type QuestionRecord = {
  id: string;
  name: string;
  question: string;
  createdAt: string;
  updatedAt: string;
  choices: ChoiceRecord[];
};

export type QuestionSummary = {
  id: string;
  name: string;
  question: string;
  createdAt: string;
  updatedAt: string;
};

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

const choiceInputSchema = z.object({
  label: z.string().trim().min(1).max(500),
  isCorrect: z.boolean(),
  position: z.number().int().min(1).max(6).optional(),
});

const questionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    question: z.string().trim().min(1).max(2000),
    choices: z.array(choiceInputSchema).min(2).max(6),
  })
  .superRefine((value, ctx) => {
    const correctCount = value.choices.filter((choice) => choice.isCorrect).length;
    if (correctCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Exactly one choice must be marked correct.",
        path: ["choices"],
      });
    }
  });

export type QuestionInput = z.input<typeof questionInputSchema>;

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new QuestionValidationError(
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }
  return parsed.data;
}

function toSummary(row: QuestionRow): QuestionSummary {
  return {
    id: row.id,
    name: row.name,
    question: row.question,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toChoice(row: ChoiceRow): ChoiceRecord {
  return {
    id: row.id,
    label: row.label,
    isCorrect: row.is_correct === 1,
    position: row.position,
  };
}

function toQuestion(row: QuestionRow, choiceRows: ChoiceRow[]): QuestionRecord {
  return {
    ...toSummary(row),
    choices: choiceRows.map(toChoice),
  };
}

async function findQuestionRowById(id: string): Promise<QuestionRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT id, name, question, created_at, updated_at FROM questions WHERE id = ?1",
    )
    .bind(id)
    .all<QuestionRow>();

  return results[0] ?? null;
}

async function findChoiceRowsByQuestionId(questionId: string): Promise<ChoiceRow[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT id, question_id, label, is_correct, position FROM choices WHERE question_id = ?1 ORDER BY position ASC",
    )
    .bind(questionId)
    .all<ChoiceRow>();

  return results;
}

async function insertChoices(
  questionId: string,
  choices: Array<{ label: string; isCorrect: boolean }>,
): Promise<void> {
  const db = await getDb();

  for (const [index, choice] of choices.entries()) {
    const id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO choices (id, question_id, label, is_correct, position) VALUES (?1, ?2, ?3, ?4, ?5)",
      )
      .bind(id, questionId, choice.label, choice.isCorrect ? 1 : 0, index + 1)
      .run();
  }
}

async function replaceChoices(
  questionId: string,
  choices: Array<{ label: string; isCorrect: boolean }>,
): Promise<void> {
  const db = await getDb();
  await db
    .prepare("DELETE FROM attempts WHERE question_id = ?1")
    .bind(questionId)
    .run();
  await db
    .prepare("DELETE FROM choices WHERE question_id = ?1")
    .bind(questionId)
    .run();
  await insertChoices(questionId, choices);
}

export async function createQuestion(input: QuestionInput): Promise<QuestionRecord> {
  const data = parseOrThrow(questionInputSchema, input);
  const id = crypto.randomUUID();
  const db = await getDb();

  await db
    .prepare("INSERT INTO questions (id, name, question) VALUES (?1, ?2, ?3)")
    .bind(id, data.name, data.question)
    .run();

  await insertChoices(id, data.choices);

  const created = await getQuestionById(id);
  if (!created) {
    throw new Error("Failed to load the question after create.");
  }
  return created;
}

export async function listQuestions(): Promise<QuestionSummary[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT id, name, question, created_at, updated_at FROM questions ORDER BY created_at DESC",
    )
    .all<QuestionRow>();

  return results.map(toSummary);
}

export async function getQuestionById(
  id: string,
): Promise<QuestionRecord | null> {
  const row = await findQuestionRowById(id);
  if (!row) {
    return null;
  }

  const choiceRows = await findChoiceRowsByQuestionId(id);
  return toQuestion(row, choiceRows);
}

export async function updateQuestion(
  id: string,
  input: QuestionInput,
): Promise<QuestionRecord> {
  const data = parseOrThrow(questionInputSchema, input);
  const current = await findQuestionRowById(id);
  if (!current) {
    throw new QuestionNotFoundError();
  }

  const db = await getDb();
  await db
    .prepare(
      "UPDATE questions SET name = ?1, question = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
    )
    .bind(data.name, data.question, id)
    .run();

  await replaceChoices(id, data.choices);

  const updated = await getQuestionById(id);
  if (!updated) {
    throw new QuestionNotFoundError();
  }
  return updated;
}

export async function deleteQuestion(id: string): Promise<void> {
  const current = await findQuestionRowById(id);
  if (!current) {
    throw new QuestionNotFoundError();
  }

  const db = await getDb();
  await db.prepare("DELETE FROM questions WHERE id = ?1").bind(id).run();
}
