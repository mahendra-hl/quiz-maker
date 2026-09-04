import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import NewQuestionPage from "@/app/test-bank/questions/new/page";
import EditQuestionPage from "@/app/test-bank/questions/[id]/edit/page";

const existingQuestion = {
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
    {
      id: "choice-3",
      label: "Produce energy",
      isCorrect: false,
      position: 3,
    },
  ],
};

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      return handler(String(input), init);
    }),
  );
}

async function renderEditPage(id: string) {
  const page = await EditQuestionPage({
    params: Promise.resolve({ id }),
  });
  render(page);
}

describe("create question page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch(async () => {
      return new Response(JSON.stringify({ question: existingQuestion }), {
        status: 201,
      });
    });
  });

  it("shows name, question, two choice fields, Save, and Cancel", () => {
    render(<NewQuestionPage />);

    expect(screen.getByLabelText(/^name$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^question$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^choice 1$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^choice 2$/i)).toBeTruthy();
    expect(screen.queryByLabelText(/^choice 3$/i)).toBeNull();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeTruthy();
  });

  it("starts with two choice rows and can add rows up to six", async () => {
    const user = userEvent.setup();
    render(<NewQuestionPage />);

    expect(screen.getByLabelText(/^choice 1$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^choice 2$/i)).toBeTruthy();
    expect(screen.queryByLabelText(/^choice 3$/i)).toBeNull();

    for (const n of [3, 4, 5, 6]) {
      await user.click(screen.getByRole("button", { name: /add choice/i }));
      expect(screen.getByLabelText(new RegExp(`^choice ${n}$`, "i"))).toBeTruthy();
    }
  });

  it("does not show Add choice once there are six rows", async () => {
    const user = userEvent.setup();
    render(<NewQuestionPage />);

    for (let i = 0; i < 4; i += 1) {
      await user.click(screen.getByRole("button", { name: /add choice/i }));
    }

    expect(screen.getByLabelText(/^choice 6$/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /add choice/i })).toBeNull();
  });

  it("lets a choice row be removed only when more than two remain", async () => {
    const user = userEvent.setup();
    render(<NewQuestionPage />);

    expect(screen.queryByRole("button", { name: /remove choice/i })).toBeNull();

    await user.click(screen.getByRole("button", { name: /add choice/i }));
    expect(screen.getByLabelText(/^choice 3$/i)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /remove choice/i })).toHaveLength(
      3,
    );

    await user.click(screen.getByRole("button", { name: /remove choice 3/i }));
    expect(screen.queryByLabelText(/^choice 3$/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /remove choice/i })).toBeNull();
  });

  it("saves a valid new question with POST /api/questions", async () => {
    const user = userEvent.setup();
    render(<NewQuestionPage />);

    await user.type(screen.getByLabelText(/^name$/i), "Cell membrane");
    await user.type(
      screen.getByLabelText(/^question$/i),
      "What is the main function of the cell membrane?",
    );
    await user.type(
      screen.getByLabelText(/^choice 1$/i),
      "Control what enters and leaves the cell",
    );
    await user.type(screen.getByLabelText(/^choice 2$/i), "Store genetic material");
    await user.click(
      screen.getByRole("radio", { name: /mark choice 1 as correct/i }),
    );
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/questions",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Cell membrane",
            question: "What is the main function of the cell membrane?",
            choices: [
              {
                label: "Control what enters and leaves the cell",
                isCorrect: true,
              },
              { label: "Store genetic material", isCorrect: false },
            ],
          }),
        }),
      );
    });
  });

  it("navigates to /test-bank after a successful save", async () => {
    const user = userEvent.setup();
    render(<NewQuestionPage />);

    await user.type(screen.getByLabelText(/^name$/i), "Cell membrane");
    await user.type(
      screen.getByLabelText(/^question$/i),
      "What is the main function of the cell membrane?",
    );
    await user.type(
      screen.getByLabelText(/^choice 1$/i),
      "Control what enters and leaves the cell",
    );
    await user.type(screen.getByLabelText(/^choice 2$/i), "Store genetic material");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/test-bank");
    });
  });

  it("navigates to /test-bank on Cancel and does not call the create API", async () => {
    const user = userEvent.setup();
    render(<NewQuestionPage />);

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(push).toHaveBeenCalledWith("/test-bank");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows server validation errors on the form", async () => {
    const user = userEvent.setup();
    mockFetch(async () => {
      return new Response(
        JSON.stringify({ error: "Exactly one choice must be marked correct." }),
        { status: 400 },
      );
    });

    render(<NewQuestionPage />);

    await user.type(screen.getByLabelText(/^name$/i), "Cell membrane");
    await user.type(
      screen.getByLabelText(/^question$/i),
      "What is the main function of the cell membrane?",
    );
    await user.type(screen.getByLabelText(/^choice 1$/i), "Option A");
    await user.type(screen.getByLabelText(/^choice 2$/i), "Option B");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(
      await screen.findByText("Exactly one choice must be marked correct."),
    ).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("edit question page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch(async (url, init) => {
      if (url === "/api/questions/question-1" && (!init || !init.method || init.method === "GET")) {
        return new Response(JSON.stringify({ question: existingQuestion }), {
          status: 200,
        });
      }
      if (url === "/api/questions/question-1" && init?.method === "PUT") {
        return new Response(JSON.stringify({ question: existingQuestion }), {
          status: 200,
        });
      }
      if (url === "/api/questions/missing-id") {
        return new Response(JSON.stringify({ error: "Question not found." }), {
          status: 404,
        });
      }
      return new Response(JSON.stringify({ error: "Unexpected request" }), {
        status: 500,
      });
    });
  });

  it("loads GET /api/questions/[id] and prefills name, question, and choices", async () => {
    await renderEditPage("question-1");

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/questions/question-1");
    });

    expect(await screen.findByDisplayValue("Cell membrane")).toBeTruthy();
    expect(
      screen.getByDisplayValue("What is the main function of the cell membrane?"),
    ).toBeTruthy();
    expect(
      screen.getByDisplayValue("Control what enters and leaves the cell"),
    ).toBeTruthy();
    expect(screen.getByDisplayValue("Store genetic material")).toBeTruthy();
    expect(screen.getByDisplayValue("Produce energy")).toBeTruthy();
  });

  it("saves an edit with PUT /api/questions/[id]", async () => {
    const user = userEvent.setup();
    await renderEditPage("question-1");

    const name = await screen.findByDisplayValue("Cell membrane");
    await user.clear(name);
    await user.type(name, "Updated membrane");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/questions/question-1",
        expect.objectContaining({
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Updated membrane",
            question: "What is the main function of the cell membrane?",
            choices: [
              {
                label: "Control what enters and leaves the cell",
                isCorrect: true,
              },
              { label: "Store genetic material", isCorrect: false },
              { label: "Produce energy", isCorrect: false },
            ],
          }),
        }),
      );
    });
  });

  it("shows Question not found. for an unknown id", async () => {
    await renderEditPage("missing-id");

    expect(await screen.findByText("Question not found.")).toBeTruthy();
  });
});
