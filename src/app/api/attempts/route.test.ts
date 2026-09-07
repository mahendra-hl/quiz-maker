import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAttempt,
  listAttemptsByQuestionId,
  AttemptValidationError,
  QuestionNotFoundError,
} = vi.hoisted(() => {
  class AttemptValidationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AttemptValidationError";
    }
  }

  class QuestionNotFoundError extends Error {
    constructor(message = "Question not found.") {
      super(message);
      this.name = "QuestionNotFoundError";
    }
  }

  return {
    createAttempt: vi.fn(),
    listAttemptsByQuestionId: vi.fn(),
    AttemptValidationError,
    QuestionNotFoundError,
    ChoiceNotFoundError: class ChoiceNotFoundError extends Error {
      constructor(message = "Choice not found.") {
        super(message);
        this.name = "ChoiceNotFoundError";
      }
    },
  };
});

vi.mock("@/lib/services/attempt", () => ({
  createAttempt,
  listAttemptsByQuestionId,
  AttemptValidationError,
  QuestionNotFoundError,
  ChoiceNotFoundError: class ChoiceNotFoundError extends Error {
    constructor(message = "Choice not found.") {
      super(message);
      this.name = "ChoiceNotFoundError";
    }
  },
}));

import { GET, POST } from "@/app/api/attempts/route";

const correctAttempt = {
  id: "attempt-1",
  questionId: "question-1",
  choiceId: "choice-correct",
  userId: null,
  isCorrect: true,
  createdAt: "2026-09-04T00:00:02.000Z",
};

const incorrectAttempt = {
  id: "attempt-2",
  questionId: "question-1",
  choiceId: "choice-wrong",
  userId: null,
  isCorrect: false,
  createdAt: "2026-09-04T00:00:03.000Z",
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest(search = "") {
  return new Request(`http://localhost/api/attempts${search}`, {
    method: "GET",
  });
}

describe("POST /api/attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with isCorrect true and the correct message", async () => {
    createAttempt.mockResolvedValue(correctAttempt);

    const response = await POST(
      postRequest({
        questionId: "question-1",
        choiceId: "choice-correct",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.attempt.isCorrect).toBe(true);
    expect(body.message).toBe("Correct. That is the right answer.");
  });

  it("returns 201 with isCorrect false and the incorrect message", async () => {
    createAttempt.mockResolvedValue(incorrectAttempt);

    const response = await POST(
      postRequest({
        questionId: "question-1",
        choiceId: "choice-wrong",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.attempt.isCorrect).toBe(false);
    expect(body.message).toBe("Incorrect. That is not the right answer.");
  });

  it("returns 400 when questionId or choiceId is missing", async () => {
    const missingQuestion = await POST(postRequest({ choiceId: "choice-1" }));
    const missingChoice = await POST(postRequest({ questionId: "question-1" }));

    expect(missingQuestion.status).toBe(400);
    expect(missingChoice.status).toBe(400);
  });

  it("returns 400 when the choice is not on that question", async () => {
    createAttempt.mockRejectedValue(
      new AttemptValidationError("Choice does not belong to this question."),
    );

    const response = await POST(
      postRequest({
        questionId: "question-1",
        choiceId: "other-choice",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Choice does not belong to this question.");
  });

  it("returns 404 for an unknown question", async () => {
    createAttempt.mockRejectedValue(new QuestionNotFoundError());

    const response = await POST(
      postRequest({
        questionId: "missing-question",
        choiceId: "choice-1",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Question not found.");
  });

  it("does not set a Set-Cookie header", async () => {
    createAttempt.mockResolvedValue(correctAttempt);

    const response = await POST(
      postRequest({
        questionId: "question-1",
        choiceId: "choice-correct",
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("GET /api/attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and that question's attempts when questionId is provided", async () => {
    listAttemptsByQuestionId.mockResolvedValue([incorrectAttempt, correctAttempt]);

    const response = await GET(getRequest("?questionId=question-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.attempts).toEqual([incorrectAttempt, correctAttempt]);
    expect(listAttemptsByQuestionId).toHaveBeenCalledWith("question-1");
  });

  it("returns 400 when questionId is missing", async () => {
    const response = await GET(getRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBeDefined();
    expect(listAttemptsByQuestionId).not.toHaveBeenCalled();
  });

  it("does not set a Set-Cookie header", async () => {
    listAttemptsByQuestionId.mockResolvedValue([]);

    const response = await GET(getRequest("?questionId=question-1"));

    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
