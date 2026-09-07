import { beforeEach, describe, expect, it, vi } from "vitest";

const { getQuestionById } = vi.hoisted(() => ({
  getQuestionById: vi.fn(),
}));

vi.mock("@/lib/services/question", () => ({
  getQuestionById,
  listQuestions: vi.fn(),
  createQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  deleteQuestion: vi.fn(),
  QuestionNotFoundError: class QuestionNotFoundError extends Error {
    constructor(message = "Question not found.") {
      super(message);
      this.name = "QuestionNotFoundError";
    }
  },
  QuestionValidationError: class QuestionValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "QuestionValidationError";
    }
  },
}));

import { GET } from "@/app/api/questions/[id]/preview/route";

const question = {
  id: "question-1",
  name: "Cell membrane",
  question: "What is the main function of the cell membrane?",
  createdAt: "2026-09-04T00:00:01.000Z",
  updatedAt: "2026-09-04T00:00:01.000Z",
  choices: [
    {
      id: "choice-1",
      label: "Control what enters and leaves the cell",
      isCorrect: true,
      position: 1,
    },
    {
      id: "choice-2",
      label: "Store genetic material",
      isCorrect: false,
      position: 2,
    },
  ],
};

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/questions/[id]/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and choices without isCorrect", async () => {
    getQuestionById.mockResolvedValue(question);

    const response = await GET(
      new Request("http://localhost/api/questions/question-1/preview"),
      context("question-1"),
    );
    const body = await response.json();
    const payload = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.question.id).toBe("question-1");
    expect(body.question.name).toBe("Cell membrane");
    expect(body.question.question).toBe(
      "What is the main function of the cell membrane?",
    );
    expect(body.question.choices).toEqual([
      {
        id: "choice-1",
        label: "Control what enters and leaves the cell",
        position: 1,
      },
      {
        id: "choice-2",
        label: "Store genetic material",
        position: 2,
      },
    ]);
    expect(payload).not.toContain("isCorrect");
    expect(payload).not.toContain("is_correct");
  });

  it("returns 404 and Question not found for an unknown id", async () => {
    getQuestionById.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/questions/missing/preview"),
      context("missing"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Question not found.");
  });

  it("does not set a Set-Cookie header", async () => {
    getQuestionById.mockResolvedValue(question);

    const response = await GET(
      new Request("http://localhost/api/questions/question-1/preview"),
      context("question-1"),
    );

    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
