import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createQuestion,
  listQuestions,
  QuestionValidationError,
} from "@/lib/services/question";

const choiceSchema = z.object({
  label: z.string().trim().min(1).max(500),
  isCorrect: z.boolean(),
});

const questionBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    question: z.string().trim().min(1).max(2000),
    choices: z.array(choiceSchema).min(2).max(6),
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

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function unexpectedError(context: string, error: unknown) {
  console.error(context, error);
  const message =
    process.env.NODE_ENV !== "production" && error instanceof Error
      ? error.message
      : "Internal server error.";
  return jsonError(message, 500);
}

export async function GET() {
  try {
    const questions = await listQuestions();
    return NextResponse.json({ questions }, { status: 200 });
  } catch (error) {
    return unexpectedError("GET /api/questions failed", error);
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const parsed = questionBodySchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid input.", 400);
    }

    const question = await createQuestion(parsed.data);
    return NextResponse.json({ question }, { status: 201 });
  } catch (error) {
    if (error instanceof QuestionValidationError) {
      return jsonError(error.message, 400);
    }

    return unexpectedError("POST /api/questions failed", error);
  }
}
