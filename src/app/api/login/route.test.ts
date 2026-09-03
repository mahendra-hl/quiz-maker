import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "@/lib/services/user";

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
};

const { mockDb } = vi.hoisted(() => {
  const rows: UserRow[] = [];
  const calls: { sql: string; binds: unknown[] }[] = [];

  function applyWrite(sql: string, binds: unknown[]) {
    const insert = sql.match(
      /INSERT INTO users \(([^)]+)\) VALUES \(([^)]+)\)/i,
    );
    if (!insert) {
      return;
    }

    const columns = insert[1].split(",").map((part) => part.trim());
    const placeholders = insert[2].split(",").map((part) => part.trim());
    const row: Record<string, string> = {};

    columns.forEach((column, index) => {
      const placeholder = placeholders[index];
      const bindIndex = Number(placeholder.replace("?", "")) - 1;
      row[column] = String(binds[bindIndex]);
    });

    rows.push({
      id: row.id ?? crypto.randomUUID(),
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      password_hash: row.password_hash,
    });
  }

  function applyRead(sql: string, binds: unknown[]) {
    const byEmail = sql.match(/WHERE email = \?(\d+)/i);
    if (byEmail) {
      const email = binds[Number(byEmail[1]) - 1];
      return rows.filter((row) => row.email === email);
    }

    const byId = sql.match(/WHERE id = \?(\d+)/i);
    if (byId) {
      const id = binds[Number(byId[1]) - 1];
      return rows.filter((row) => row.id === id);
    }

    return [];
  }

  return {
    mockDb: {
      rows,
      calls,
      reset() {
        rows.length = 0;
        calls.length = 0;
      },
      prepare(sql: string) {
        let binds: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) {
            binds = values;
            return statement;
          },
          async run() {
            calls.push({ sql, binds });
            applyWrite(sql, binds);
            return { success: true };
          },
          async all() {
            calls.push({ sql, binds });
            return { results: applyRead(sql, binds) };
          },
        };
        return statement;
      },
    },
  };
});

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { DB: mockDb },
  })),
}));

import { POST } from "@/app/api/login/route";

const teacher = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@school.edu",
  password: "correct-horse-battery",
};

function loginRequest(body: unknown) {
  return new Request("http://localhost/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/login", () => {
  beforeEach(async () => {
    mockDb.reset();
    vi.clearAllMocks();
    await createUser(teacher);
  });

  it("returns 200 with the public user object when email and password are correct", async () => {
    const response = await POST(
      loginRequest({ email: "Jane@School.edu", password: teacher.password }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toEqual({
      id: expect.any(String),
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@school.edu",
    });
  });

  it("does not include password or password_hash in the response", async () => {
    const response = await POST(
      loginRequest({ email: teacher.email, password: teacher.password }),
    );
    const payload = JSON.stringify(await response.json());

    expect(payload).not.toContain("password");
    expect(payload).not.toContain("password_hash");
    expect(payload).not.toContain(teacher.password);
  });

  it("returns 401 with Invalid email or password when the password is wrong", async () => {
    const response = await POST(
      loginRequest({ email: teacher.email, password: "wrong-password-value" }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Invalid email or password.");
  });

  it("returns 401 with Invalid email or password when the email is unknown", async () => {
    const response = await POST(
      loginRequest({
        email: "missing@school.edu",
        password: teacher.password,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Invalid email or password.");
  });

  it("returns 400 when email or password is missing", async () => {
    const missingEmail = await POST(
      loginRequest({ password: teacher.password }),
    );
    const missingPassword = await POST(loginRequest({ email: teacher.email }));

    expect(missingEmail.status).toBe(400);
    expect(missingPassword.status).toBe(400);
  });

  it("does not set a Set-Cookie header on success", async () => {
    const response = await POST(
      loginRequest({ email: teacher.email, password: teacher.password }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("looks up the user by email, not by another identifier", async () => {
    mockDb.calls.length = 0;

    await POST(
      loginRequest({ email: "Jane@School.edu", password: teacher.password }),
    );

    const emailLookups = mockDb.calls.filter((call) =>
      /WHERE email = \?\d+/i.test(call.sql),
    );
    expect(emailLookups.length).toBeGreaterThan(0);
    expect(emailLookups[0]?.sql).toMatch(/\?1/);
    expect(emailLookups[0]?.binds).toContain("jane@school.edu");
    expect(emailLookups[0]?.sql).not.toContain("Jane@School.edu");
    expect(
      mockDb.calls.some((call) => /WHERE (id|first_name|last_name) =/i.test(call.sql)),
    ).toBe(false);
  });
});
