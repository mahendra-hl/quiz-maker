import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegisterForm } from "@/components/auth/register-form";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ user: { id: "1" } }), { status: 201 }),
      ),
    );
  });

  it("exposes first name, last name, email, password, and a submit control", () => {
    render(<RegisterForm />);

    expect(screen.getByLabelText(/first name/i)).toBeTruthy();
    expect(screen.getByLabelText(/last name/i)).toBeTruthy();
    expect(screen.getByLabelText(/^email$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /create account/i }),
    ).toBeTruthy();
  });

  it("submits valid registration to POST /api/register", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Doe");
    await user.type(screen.getByLabelText(/^email$/i), "jane@school.edu");
    await user.type(screen.getByLabelText(/^password$/i), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/register",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "Jane",
          lastName: "Doe",
          email: "jane@school.edu",
          password: "correct-horse-battery",
        }),
      }),
    );
  });

  it("shows a server error including duplicate email to the user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "An account with this email already exists.",
            }),
            { status: 409 },
          ),
      ),
    );
    const user = userEvent.setup();
    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Doe");
    await user.type(screen.getByLabelText(/^email$/i), "jane@school.edu");
    await user.type(screen.getByLabelText(/^password$/i), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(
      await screen.findByText("An account with this email already exists."),
    ).toBeTruthy();
  });

  it("does not write cookies during registration", async () => {
    const user = userEvent.setup();
    const cookieBefore = document.cookie;
    render(<RegisterForm />);

    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Doe");
    await user.type(screen.getByLabelText(/^email$/i), "jane@school.edu");
    await user.type(screen.getByLabelText(/^password$/i), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(document.cookie).toBe(cookieBefore);
  });
});
