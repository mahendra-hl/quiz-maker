import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "@/components/auth/login-form";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              user: {
                id: "1",
                firstName: "Jane",
                lastName: "Doe",
                email: "jane@school.edu",
              },
            }),
            { status: 200 },
          ),
      ),
    );
  });

  it("exposes email, password, and a submit control", () => {
    render(<LoginForm />);

    expect(screen.getByLabelText(/^email$/i)).toBeTruthy();
    expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /log in/i })).toBeTruthy();
  });

  it("calls POST /api/login and navigates to /test-bank on success", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/^email$/i), "jane@school.edu");
    await user.type(screen.getByLabelText(/^password$/i), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/login",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "jane@school.edu",
          password: "correct-horse-battery",
        }),
      }),
    );
    expect(push).toHaveBeenCalledWith("/test-bank");
  });

  it("shows Invalid email or password and does not navigate on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: "Invalid email or password." }),
            { status: 401 },
          ),
      ),
    );
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/^email$/i), "jane@school.edu");
    await user.type(screen.getByLabelText(/^password$/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("Invalid email or password.")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not write cookies during login", async () => {
    const user = userEvent.setup();
    const cookieBefore = document.cookie;
    render(<LoginForm />);

    await user.type(screen.getByLabelText(/^email$/i), "jane@school.edu");
    await user.type(screen.getByLabelText(/^password$/i), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(document.cookie).toBe(cookieBefore);
  });
});
