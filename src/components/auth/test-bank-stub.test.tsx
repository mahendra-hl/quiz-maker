import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestBankStub } from "@/components/auth/test-bank-stub";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("TestBankStub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
  });

  it("renders a heading for the MCQ test bank and a logout control", () => {
    render(<TestBankStub />);

    expect(
      screen.getByRole("heading", { name: /mcq test bank/i }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /log out/i })).toBeTruthy();
  });

  it("calls POST /api/logout and navigates to /login", async () => {
    const user = userEvent.setup();
    render(<TestBankStub />);

    await user.click(screen.getByRole("button", { name: /log out/i }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/logout",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(push).toHaveBeenCalledWith("/login");
  });

  it("does not write cookies during logout", async () => {
    const user = userEvent.setup();
    const cookieBefore = document.cookie;
    render(<TestBankStub />);

    await user.click(screen.getByRole("button", { name: /log out/i }));

    expect(document.cookie).toBe(cookieBefore);
  });
});
