import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AttemptValidationError,
  ChoiceNotFoundError,
  createAttempt,
  listAttemptsByQuestionId,
  QuestionNotFoundError,
} from "@/lib/services/attempt";

const createAttemptSchema = z.object({
  questionId: z.string().trim().min(1),
  choiceId: z.string().trim().min(1),
  userId: z.string().trim().min(1).optional(),
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

function feedbackMessage(isCorrect: boolean) {
  return isCorrect
    ? "Correct. That is the right answer."
    : "Incorrect. That is not the right answer.";
}

export async function GET(request: Request) {
  try {
    const questionId = new URL(request.url).searchParams.get("questionId")?.trim();
    if (!questionId) {
      return jsonError("questionId is required.", 400);
    }

    const attempts = await listAttemptsByQuestionId(questionId);
    return NextResponse.json({ attempts }, { status: 200 });
  } catch (error) {
    return unexpectedError("GET /api/attempts failed", error);
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

    const parsed = createAttemptSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Invalid input.", 400);
    }

    const attempt = await createAttempt(parsed.data);
    return NextResponse.json(
      {
        attempt,
        message: feedbackMessage(attempt.isCorrect),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AttemptValidationError) {
      return jsonError(error.message, 400);
    }

    if (error instanceof QuestionNotFoundError) {
      return jsonError(error.message, 404);
    }

    if (error instanceof ChoiceNotFoundError) {
      return jsonError(error.message, 404);
    }

    return unexpectedError("POST /api/attempts failed", error);
  }
}
