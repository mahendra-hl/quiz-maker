import { NextResponse } from "next/server";
import { getQuestionById, QuestionNotFoundError } from "@/lib/services/question";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const question = await getQuestionById(id);
    if (!question) {
      return jsonError("Question not found.", 404);
    }

    return NextResponse.json(
      {
        question: {
          id: question.id,
          name: question.name,
          question: question.question,
          choices: question.choices.map((choice) => ({
            id: choice.id,
            label: choice.label,
            position: choice.position,
          })),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof QuestionNotFoundError) {
      return jsonError(error.message, 404);
    }

    console.error("GET /api/questions/[id]/preview failed", error);
    const message =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? error.message
        : "Internal server error.";
    return jsonError(message, 500);
  }
}
