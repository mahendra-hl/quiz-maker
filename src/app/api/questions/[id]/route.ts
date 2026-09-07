import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteQuestion,
  getQuestionById,
  QuestionNotFoundError,
  QuestionValidationError,
  updateQuestion,
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

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

async function readId(context: RouteContext) {
  const { id } = await context.params;
  return id;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const id = await readId(context);
    const question = await getQuestionById(id);
    if (!question) {
      return jsonError("Question not found.", 404);
    }

    return NextResponse.json({ question }, { status: 200 });
  } catch (error) {
    if (error instanceof QuestionNotFoundError) {
      return jsonError(error.message, 404);
    }

    return unexpectedError("GET /api/questions/[id] failed", error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const id = await readId(context);
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

    const question = await updateQuestion(id, parsed.data);
    return NextResponse.json({ question }, { status: 200 });
  } catch (error) {
    if (error instanceof QuestionNotFoundError) {
      return jsonError(error.message, 404);
    }

    if (error instanceof QuestionValidationError) {
      return jsonError(error.message, 400);
    }

    return unexpectedError("PUT /api/questions/[id] failed", error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const id = await readId(context);
    await deleteQuestion(id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof QuestionNotFoundError) {
      return jsonError(error.message, 404);
    }

    return unexpectedError("DELETE /api/questions/[id] failed", error);
  }
}
