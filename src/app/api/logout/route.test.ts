import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/logout/route";

function logoutRequest(headers?: HeadersInit) {
  return new Request("http://localhost/api/logout", {
    method: "POST",
    headers,
  });
}

describe("POST /api/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 and { ok: true }", async () => {
    const response = await POST(logoutRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("does not set a Set-Cookie header", async () => {
    const response = await POST(logoutRequest());

    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not read cookies", async () => {
    const request = logoutRequest({ cookie: "session=should-not-be-read" });
    const getHeader = vi.spyOn(request.headers, "get");

    await POST(request);

    expect(
      getHeader.mock.calls.some(
        ([name]) => String(name).toLowerCase() === "cookie",
      ),
    ).toBe(false);
    expect(request.headers.get("cookie")).toBe("session=should-not-be-read");
  });
});
