import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionTable } from "@/components/questions/question-table";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const questions = [
  {
    id: "question-1",
    name: "Cell membrane",
    question: "What is the main function of the cell membrane?",
    createdAt: "2026-09-04T00:00:01.000Z",
    updatedAt: "2026-09-04T00:00:01.000Z",
  },
  {
    id: "question-2",
    name: "Mitochondria",
    question: "What is the powerhouse of the cell?",
    createdAt: "2026-09-04T00:00:02.000Z",
    updatedAt: "2026-09-04T00:00:02.000Z",
  },
];

function mockFetch(handler: (input: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      return handler(url, init);
    }),
  );
}

describe("QuestionTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch(async () => {
      return new Response(JSON.stringify({ questions }), { status: 200 });
    });
  });

  it("fetches GET /api/questions and renders each question's name and stem", async () => {
    render(<QuestionTable />);

    await waitFor(() => {
      expect(screen.getByText("Cell membrane")).toBeTruthy();
      expect(
        screen.getByText("What is the main function of the cell membrane?"),
      ).toBeTruthy();
      expect(screen.getByText("Mitochondria")).toBeTruthy();
      expect(screen.getByText("What is the powerhouse of the cell?")).toBeTruthy();
    });

    expect(fetch).toHaveBeenCalledWith("/api/questions");
  });

  it("shows a no-questions message and a Create control when the list is empty", async () => {
    mockFetch(async () => {
      return new Response(JSON.stringify({ questions: [] }), { status: 200 });
    });

    render(<QuestionTable />);

    await waitFor(() => {
      expect(screen.getByText(/no questions yet/i)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /create/i })).toBeTruthy();
  });

  it("navigates to /test-bank/questions/new when Create is clicked", async () => {
    const user = userEvent.setup();
    render(<QuestionTable />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create/i })).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: /create/i }));

    expect(push).toHaveBeenCalledWith("/test-bank/questions/new");
  });

  it("opens a three-dot actions menu with Edit, Delete, and Preview", async () => {
    const user = userEvent.setup();
    render(<QuestionTable />);

    const actions = await screen.findByRole("button", {
      name: /actions for cell membrane/i,
    });
    await user.click(actions);

    expect(screen.getByRole("menuitem", { name: /edit/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /delete/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /preview/i })).toBeTruthy();
  });

  it("navigates to the edit page from the actions menu", async () => {
    const user = userEvent.setup();
    render(<QuestionTable />);

    await user.click(
      await screen.findByRole("button", { name: /actions for cell membrane/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: /edit/i }));

    expect(push).toHaveBeenCalledWith("/test-bank/questions/question-1/edit");
  });

  it("navigates to the preview page from the actions menu", async () => {
    const user = userEvent.setup();
    render(<QuestionTable />);

    await user.click(
      await screen.findByRole("button", { name: /actions for mitochondria/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: /preview/i }));

    expect(push).toHaveBeenCalledWith("/test-bank/questions/question-2/preview");
  });

  it("asks for confirmation, deletes the question, and removes the row", async () => {
    const user = userEvent.setup();
    mockFetch(async (url, init) => {
      if (url === "/api/questions" && (!init || !init.method || init.method === "GET")) {
        return new Response(JSON.stringify({ questions }), { status: 200 });
      }
      if (url === "/api/questions/question-1" && init?.method === "DELETE") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "Unexpected request" }), {
        status: 500,
      });
    });

    render(<QuestionTable />);

    await user.click(
      await screen.findByRole("button", { name: /actions for cell membrane/i }),
    );
    await user.click(screen.getByRole("menuitem", { name: /delete/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/delete/i)).toBeTruthy();

    await user.click(within(dialog).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/questions/question-1",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(screen.queryByText("Cell membrane")).toBeNull();
    });
    expect(screen.getByText("Mitochondria")).toBeTruthy();
  });

  it("shows an error when the list request fails", async () => {
    mockFetch(async () => {
      return new Response(JSON.stringify({ error: "Internal server error." }), {
        status: 500,
      });
    });

    render(<QuestionTable />);

    await waitFor(() => {
      expect(screen.getByText(/could not load questions/i)).toBeTruthy();
    });
  });
});
