import { z } from "zod";
import { getDb } from "@/lib/db";
import { QuestionNotFoundError } from "@/lib/services/question";

export { QuestionNotFoundError };

export class AttemptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttemptValidationError";
  }
}

export class ChoiceNotFoundError extends Error {
  constructor(message = "Choice not found.") {
    super(message);
    this.name = "ChoiceNotFoundError";
  }
}

export type AttemptRecord = {
  id: string;
  questionId: string;
  choiceId: string;
  userId: string | null;
  isCorrect: boolean;
  createdAt: string;
};

type AttemptRow = {
  id: string;
  question_id: string;
  choice_id: string;
  user_id: string | null;
  is_correct: number;
  created_at: string;
};

type ChoiceRow = {
  id: string;
  question_id: string;
  is_correct: number;
};

type QuestionRow = {
  id: string;
};

const createAttemptSchema = z.object({
  questionId: z.string().trim().min(1),
  choiceId: z.string().trim().min(1),
  userId: z.string().trim().min(1).optional(),
});

export type CreateAttemptInput = z.input<typeof createAttemptSchema> & {
  isCorrect?: boolean;
};

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new AttemptValidationError(
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }
  return parsed.data;
}

function toAttempt(row: AttemptRow): AttemptRecord {
  return {
    id: row.id,
    questionId: row.question_id,
    choiceId: row.choice_id,
    userId: row.user_id,
    isCorrect: row.is_correct === 1,
    createdAt: row.created_at,
  };
}

async function findQuestionRowById(id: string): Promise<QuestionRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare("SELECT id FROM questions WHERE id = ?1")
    .bind(id)
    .all<QuestionRow>();

  return results[0] ?? null;
}

async function findChoiceRowById(id: string): Promise<ChoiceRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare("SELECT id, question_id, is_correct FROM choices WHERE id = ?1")
    .bind(id)
    .all<ChoiceRow>();

  return results[0] ?? null;
}

async function findAttemptRowById(id: string): Promise<AttemptRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT id, question_id, choice_id, user_id, is_correct, created_at FROM attempts WHERE id = ?1",
    )
    .bind(id)
    .all<AttemptRow>();

  return results[0] ?? null;
}

export async function createAttempt(
  input: CreateAttemptInput,
): Promise<AttemptRecord> {
  const data = parseOrThrow(createAttemptSchema, input);

  const question = await findQuestionRowById(data.questionId);
  if (!question) {
    throw new QuestionNotFoundError();
  }

  const choice = await findChoiceRowById(data.choiceId);
  if (!choice) {
    throw new ChoiceNotFoundError();
  }

  if (choice.question_id !== data.questionId) {
    throw new AttemptValidationError(
      "Choice does not belong to this question.",
    );
  }

  const id = crypto.randomUUID();
  const db = await getDb();
  await db
    .prepare(
      "INSERT INTO attempts (id, question_id, choice_id, user_id, is_correct) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(
      id,
      data.questionId,
      data.choiceId,
      data.userId ?? null,
      choice.is_correct,
    )
    .run();

  const created = await findAttemptRowById(id);
  if (!created) {
    throw new Error("Failed to load the attempt after create.");
  }
  return toAttempt(created);
}

export async function listAttemptsByQuestionId(
  questionId: string,
): Promise<AttemptRecord[]> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT id, question_id, choice_id, user_id, is_correct, created_at FROM attempts WHERE question_id = ?1 ORDER BY created_at DESC",
    )
    .bind(questionId)
    .all<AttemptRow>();

  return results.map(toAttempt);
}
