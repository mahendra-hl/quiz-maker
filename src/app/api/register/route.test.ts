import { beforeEach, describe, expect, it, vi } from "vitest";

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

    if (rows.some((existing) => existing.email === row.email)) {
      throw new Error("UNIQUE constraint failed: users.email");
    }

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

import { POST } from "@/app/api/register/route";

const validBody = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@school.edu",
  password: "correct-horse-battery",
};

function registerRequest(body: unknown) {
  return new Request("http://localhost/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/register", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("creates a user and returns 201 with id, firstName, lastName, and email", async () => {
    const response = await POST(registerRequest(validBody));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.user).toEqual({
      id: expect.any(String),
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@school.edu",
    });
  });

  it("does not include password or password_hash in the response", async () => {
    const response = await POST(registerRequest(validBody));
    const payload = JSON.stringify(await response.json());

    expect(payload).not.toContain("password");
    expect(payload).not.toContain("password_hash");
    expect(payload).not.toContain(validBody.password);
  });

  it("gives the persistence layer a hash, not the plaintext password", async () => {
    await POST(registerRequest(validBody));

    const insert = mockDb.calls.find((call) => /INSERT INTO users/i.test(call.sql));
    expect(insert).toBeDefined();
    expect(insert?.binds).not.toContain(validBody.password);
    expect(mockDb.rows[0]?.password_hash).toBeDefined();
    expect(mockDb.rows[0]?.password_hash).not.toBe(validBody.password);
    expect(mockDb.rows[0]?.password_hash).toMatch(/^pbkdf2-sha256\$/);
  });

  it("returns 400 when required fields are missing", async () => {
    const response = await POST(
      registerRequest({
        lastName: "Doe",
        email: "jane@school.edu",
        password: "correct-horse-battery",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when the email is invalid", async () => {
    const response = await POST(
      registerRequest({ ...validBody, email: "not-an-email" }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when the password is shorter than 8 characters", async () => {
    const response = await POST(
      registerRequest({ ...validBody, password: "1234567" }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 409 with a duplicate-email message when the email is already registered", async () => {
    await POST(registerRequest(validBody));

    const response = await POST(
      registerRequest({ ...validBody, firstName: "John" }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("An account with this email already exists.");
  });
});
