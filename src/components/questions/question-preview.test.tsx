import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import PreviewQuestionPage from "@/app/test-bank/questions/[id]/preview/page";

const previewQuestion = {
  id: "question-1",
  name: "Cell membrane",
  question: "What is the main function of the cell membrane?",
  choices: [
    {
      id: "choice-correct",
      label: "Control what enters and leaves the cell",
      position: 1,
      isCorrect: true,
    },
    {
      id: "choice-wrong",
      label: "Store genetic material",
      position: 2,
      isCorrect: false,
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

async function renderPreviewPage(id: string) {
  const page = await PreviewQuestionPage({
    params: Promise.resolve({ id }),
  });
  render(page);
}

describe("preview question page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch(async (url, init) => {
      if (
        url === "/api/questions/question-1/preview" &&
        (!init || !init.method || init.method === "GET")
      ) {
        return new Response(JSON.stringify({ question: previewQuestion }), {
          status: 200,
        });
      }
      if (url === "/api/questions/missing-id/preview") {
        return new Response(JSON.stringify({ error: "Question not found." }), {
          status: 404,
        });
      }
      if (url === "/api/attempts" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { choiceId?: string };
        const isCorrect = body.choiceId === "choice-correct";
        return new Response(
          JSON.stringify({
            attempt: {
              id: "attempt-1",
              questionId: "question-1",
              choiceId: body.choiceId,
              isCorrect,
            },
            message: isCorrect
              ? "Correct. That is the right answer."
              : "Incorrect. That is not the right answer.",
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({ error: "Unexpected request" }), {
        status: 500,
      });
    });
  });

  it("loads GET /api/questions/[id]/preview and shows the stem and choice labels", async () => {
    await renderPreviewPage("question-1");

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/questions/question-1/preview");
    });

    expect(
      await screen.findByText("What is the main function of the cell membrane?"),
    ).toBeTruthy();
    expect(
      screen.getByText("Control what enters and leaves the cell"),
    ).toBeTruthy();
    expect(screen.getByText("Store genetic material")).toBeTruthy();
  });

  it("does not render a correct-answer flag from the payload", async () => {
    await renderPreviewPage("question-1");

    expect(
      await screen.findByText("What is the main function of the cell membrane?"),
    ).toBeTruthy();
    expect(screen.queryByText(/isCorrect/i)).toBeNull();
    expect(screen.queryByText("true")).toBeNull();
    expect(screen.queryByText("false")).toBeNull();
    expect(
      screen.queryByText("Correct. That is the right answer."),
    ).toBeNull();
  });

  it("disables Submit until a choice is selected", async () => {
    await renderPreviewPage("question-1");

    const submit = await screen.findByRole("button", { name: /^submit$/i });
    expect(submit).toHaveProperty("disabled", true);

    await userEvent.click(
      screen.getByRole("radio", {
        name: /control what enters and leaves the cell/i,
      }),
    );

    expect(submit).toHaveProperty("disabled", false);
  });

  it("submits POST /api/attempts with questionId and the selected choiceId", async () => {
    const user = userEvent.setup();
    await renderPreviewPage("question-1");

    await user.click(
      await screen.findByRole("radio", {
        name: /store genetic material/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: /^submit$/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/attempts",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: "question-1",
            choiceId: "choice-wrong",
          }),
        }),
      );
    });
  });

  it("shows the correct message after a right answer", async () => {
    const user = userEvent.setup();
    await renderPreviewPage("question-1");

    await user.click(
      await screen.findByRole("radio", {
        name: /control what enters and leaves the cell/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: /^submit$/i }));

    expect(
      await screen.findByText("Correct. That is the right answer."),
    ).toBeTruthy();
  });

  it("shows the incorrect message after a wrong answer", async () => {
    const user = userEvent.setup();
    await renderPreviewPage("question-1");

    await user.click(
      await screen.findByRole("radio", {
        name: /store genetic material/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: /^submit$/i }));

    expect(
      await screen.findByText("Incorrect. That is not the right answer."),
    ).toBeTruthy();
  });

  it("shows Question not found. for an unknown id", async () => {
    await renderPreviewPage("missing-id");

    expect(await screen.findByText("Question not found.")).toBeTruthy();
  });

  it("returns the teacher to /test-bank from a control", async () => {
    const user = userEvent.setup();
    await renderPreviewPage("question-1");

    await user.click(
      await screen.findByRole("button", { name: /back to test bank/i }),
    );

    expect(push).toHaveBeenCalledWith("/test-bank");
  });
});
