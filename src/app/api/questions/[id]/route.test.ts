import { beforeEach, describe, expect, it, vi } from "vitest";

const { getQuestionById, updateQuestion, deleteQuestion, QuestionNotFoundError } =
  vi.hoisted(() => {
    class QuestionNotFoundError extends Error {
      constructor(message = "Question not found.") {
        super(message);
        this.name = "QuestionNotFoundError";
      }
    }

    return {
      listQuestions: vi.fn(),
      createQuestion: vi.fn(),
      getQuestionById: vi.fn(),
      updateQuestion: vi.fn(),
      deleteQuestion: vi.fn(),
      QuestionNotFoundError,
      QuestionValidationError: class QuestionValidationError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "QuestionValidationError";
        }
      },
    };
  });

vi.mock("@/lib/services/question", () => ({
  listQuestions: vi.fn(),
  createQuestion: vi.fn(),
  getQuestionById,
  updateQuestion,
  deleteQuestion,
  QuestionNotFoundError,
  QuestionValidationError: class QuestionValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "QuestionValidationError";
    }
  },
}));

import { DELETE, GET, PUT } from "@/app/api/questions/[id]/route";

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

const updateBody = {
  name: "Updated name",
  question: "Updated stem?",
  choices: [
    { label: "New A", isCorrect: false },
    { label: "New B", isCorrect: true },
  ],
};

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function putRequest(id: string, body: unknown) {
  return new Request(`http://localhost/api/questions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/questions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with choices and isCorrect", async () => {
    getQuestionById.mockResolvedValue(question);

    const response = await GET(
      new Request("http://localhost/api/questions/question-1"),
      context("question-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.question.choices).toEqual(question.choices);
    expect(body.question.choices[0]?.isCorrect).toBe(true);
  });

  it("returns 404 and Question not found for an unknown id", async () => {
    getQuestionById.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/questions/missing"),
      context("missing"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Question not found.");
  });

  it("does not set a Set-Cookie header", async () => {
    getQuestionById.mockResolvedValue(question);

    const response = await GET(
      new Request("http://localhost/api/questions/question-1"),
      context("question-1"),
    );

    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("PUT /api/questions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the question and returns 200", async () => {
    const updated = {
      ...question,
      name: "Updated name",
      question: "Updated stem?",
    };
    updateQuestion.mockResolvedValue(updated);

    const response = await PUT(putRequest("question-1", updateBody), context("question-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.question.name).toBe("Updated name");
    expect(updateQuestion).toHaveBeenCalledWith("question-1", updateBody);
  });

  it("returns 404 for an unknown id", async () => {
    updateQuestion.mockRejectedValue(new QuestionNotFoundError());

    const response = await PUT(putRequest("missing", updateBody), context("missing"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Question not found.");
  });
});

describe("DELETE /api/questions/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and { ok: true }", async () => {
    deleteQuestion.mockResolvedValue(undefined);

    const response = await DELETE(
      new Request("http://localhost/api/questions/question-1", { method: "DELETE" }),
      context("question-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(deleteQuestion).toHaveBeenCalledWith("question-1");
  });

  it("returns 404 for an unknown id", async () => {
    deleteQuestion.mockRejectedValue(new QuestionNotFoundError());

    const response = await DELETE(
      new Request("http://localhost/api/questions/missing", { method: "DELETE" }),
      context("missing"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Question not found.");
  });
});
