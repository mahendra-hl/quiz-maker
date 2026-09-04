import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listQuestions,
  createQuestion,
  QuestionValidationError,
} = vi.hoisted(() => {
  class QuestionValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "QuestionValidationError";
    }
  }

  return {
    listQuestions: vi.fn(),
    createQuestion: vi.fn(),
    getQuestionById: vi.fn(),
    updateQuestion: vi.fn(),
    deleteQuestion: vi.fn(),
    QuestionValidationError,
    QuestionNotFoundError: class QuestionNotFoundError extends Error {
      constructor(message = "Question not found.") {
        super(message);
        this.name = "QuestionNotFoundError";
      }
    },
  };
});

vi.mock("@/lib/services/question", () => ({
  listQuestions,
  createQuestion,
  getQuestionById: vi.fn(),
  updateQuestion: vi.fn(),
  deleteQuestion: vi.fn(),
  QuestionValidationError,
  QuestionNotFoundError: class QuestionNotFoundError extends Error {
    constructor(message = "Question not found.") {
      super(message);
      this.name = "QuestionNotFoundError";
    }
  },
}));

import { GET, POST } from "@/app/api/questions/route";

const validBody = {
  name: "Cell membrane",
  question: "What is the main function of the cell membrane?",
  choices: [
    { label: "Control what enters and leaves the cell", isCorrect: true },
    { label: "Store genetic material", isCorrect: false },
  ],
};

const createdQuestion = {
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

function postRequest(body: unknown) {
  return new Request("http://localhost/api/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/questions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and the question list without choices", async () => {
    listQuestions.mockResolvedValue([
      {
        id: "question-1",
        name: "Cell membrane",
        question: "What is the main function of the cell membrane?",
        createdAt: "2026-09-04T00:00:01.000Z",
        updatedAt: "2026-09-04T00:00:01.000Z",
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0]).toEqual({
      id: "question-1",
      name: "Cell membrane",
      question: "What is the main function of the cell membrane?",
      createdAt: "2026-09-04T00:00:01.000Z",
      updatedAt: "2026-09-04T00:00:01.000Z",
    });
    expect(body.questions[0]).not.toHaveProperty("choices");
  });

  it("does not set a Set-Cookie header", async () => {
    listQuestions.mockResolvedValue([]);

    const response = await GET();

    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("POST /api/questions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 including choice ids for a valid body", async () => {
    createQuestion.mockResolvedValue(createdQuestion);

    const response = await POST(postRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.question.id).toBe("question-1");
    expect(body.question.choices.map((choice: { id: string }) => choice.id)).toEqual([
      "choice-1",
      "choice-2",
    ]);
    expect(createQuestion).toHaveBeenCalledWith(validBody);
  });

  it("returns 400 when there is only one choice", async () => {
    createQuestion.mockRejectedValue(
      new QuestionValidationError("At least 2 choices are required."),
    );

    const response = await POST(
      postRequest({
        ...validBody,
        choices: [{ label: "Only one", isCorrect: true }],
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when two choices are correct", async () => {
    createQuestion.mockRejectedValue(
      new QuestionValidationError("Exactly one choice must be marked correct."),
    );

    const response = await POST(
      postRequest({
        ...validBody,
        choices: [
          { label: "One", isCorrect: true },
          { label: "Two", isCorrect: true },
        ],
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when the name is blank", async () => {
    createQuestion.mockRejectedValue(new QuestionValidationError("Name is required."));

    const response = await POST(postRequest({ ...validBody, name: "" }));

    expect(response.status).toBe(400);
  });

  it("does not set a Set-Cookie header", async () => {
    createQuestion.mockResolvedValue(createdQuestion);

    const response = await POST(postRequest(validBody));

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
