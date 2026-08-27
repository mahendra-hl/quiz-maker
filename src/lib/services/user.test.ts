import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "@/lib/password";

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
    if (insert) {
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
      return;
    }

    const update = sql.match(/UPDATE users SET (.+) WHERE id = \?(\d+)/i);
    if (update) {
      const id = binds[Number(update[2]) - 1];
      const row = rows.find((existing) => existing.id === id);
      if (!row) {
        return;
      }

      for (const assignment of update[1].split(",").map((part) => part.trim())) {
        const matched = assignment.match(/^(\w+)\s*=\s*\?(\d+)$/i);
        if (!matched) {
          continue;
        }

        const column = matched[1] as keyof UserRow;
        row[column] = String(binds[Number(matched[2]) - 1]);
      }
      return;
    }

    const deleted = sql.match(/DELETE FROM users WHERE id = \?(\d+)/i);
    if (deleted) {
      const id = binds[Number(deleted[1]) - 1];
      const index = rows.findIndex((existing) => existing.id === id);
      if (index >= 0) {
        rows.splice(index, 1);
      }
    }
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

vi.mock("server-only", () => ({}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { DB: mockDb },
  })),
}));

import {
  createUser,
  deleteUser,
  DuplicateEmailError,
  findUserByEmail,
  updateUser,
  UserValidationError,
} from "@/lib/services/user";

const validInput = {
  firstName: "Jane",
  lastName: "Doe",
  email: "Jane@School.edu",
  password: "correct-horse-battery",
};

describe("createUser", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("stores first_name, last_name, and a lowercased email", async () => {
    await createUser(validInput);

    expect(mockDb.rows).toHaveLength(1);
    expect(mockDb.rows[0]?.first_name).toBe("Jane");
    expect(mockDb.rows[0]?.last_name).toBe("Doe");
    expect(mockDb.rows[0]?.email).toBe("jane@school.edu");
  });

  it("stores a password hash and never the plaintext password", async () => {
    await createUser(validInput);

    const row = mockDb.rows[0];
    expect(row).toBeDefined();
    expect(row?.password_hash).toBeDefined();
    expect(row?.password_hash).not.toBe(validInput.password);
    expect(row?.password_hash).not.toContain(validInput.password);
    expect(Object.values(row ?? {})).not.toContain(validInput.password);
    await expect(
      verifyPassword(validInput.password, row?.password_hash ?? ""),
    ).resolves.toBe(true);
  });

  it("fails when the email is already registered", async () => {
    await createUser(validInput);

    await expect(
      createUser({
        ...validInput,
        firstName: "John",
        email: "JANE@school.edu",
      }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
  });

  it("fails validation when first name, last name, or email is missing or blank", async () => {
    await expect(
      createUser({ ...validInput, firstName: "" }),
    ).rejects.toBeInstanceOf(UserValidationError);
    await expect(
      createUser({ ...validInput, lastName: "   " }),
    ).rejects.toBeInstanceOf(UserValidationError);
    await expect(
      createUser({ ...validInput, email: "" }),
    ).rejects.toBeInstanceOf(UserValidationError);
    await expect(
      createUser({
        lastName: "Doe",
        email: "jane@school.edu",
        password: "correct-horse-battery",
      } as typeof validInput),
    ).rejects.toBeInstanceOf(UserValidationError);
  });

  it("fails validation when the password is shorter than 8 characters", async () => {
    await expect(
      createUser({ ...validInput, password: "1234567" }),
    ).rejects.toBeInstanceOf(UserValidationError);
  });
});

describe("findUserByEmail", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("returns the user for a known email without exposing the plaintext password", async () => {
    await createUser(validInput);

    const found = await findUserByEmail("JANE@school.edu");
    expect(found).not.toBeNull();
    expect(found?.firstName).toBe("Jane");
    expect(found?.lastName).toBe("Doe");
    expect(found?.email).toBe("jane@school.edu");
    expect(found?.passwordHash).not.toBe(validInput.password);
    expect(found).not.toHaveProperty("password");
    await expect(
      verifyPassword(validInput.password, found?.passwordHash ?? ""),
    ).resolves.toBe(true);
  });

  it("returns null for an unknown email", async () => {
    await expect(findUserByEmail("missing@school.edu")).resolves.toBeNull();
  });
});

describe("updateUser", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("updates first name, last name, and/or email", async () => {
    const created = await createUser(validInput);

    await updateUser(created.id, {
      firstName: "Janet",
      lastName: "Smith",
      email: "Janet@School.edu",
    });

    const found = await findUserByEmail("janet@school.edu");
    expect(found?.firstName).toBe("Janet");
    expect(found?.lastName).toBe("Smith");
    expect(found?.email).toBe("janet@school.edu");
    await expect(findUserByEmail("jane@school.edu")).resolves.toBeNull();
  });

  it("re-hashes a new password and stops accepting the old one", async () => {
    const created = await createUser(validInput);
    const nextPassword = "new-correct-horse";

    await updateUser(created.id, { password: nextPassword });

    const row = mockDb.rows[0];
    expect(row?.password_hash).not.toBe(nextPassword);
    expect(row?.password_hash).not.toBe(validInput.password);
    await expect(
      verifyPassword(validInput.password, row?.password_hash ?? ""),
    ).resolves.toBe(false);
    await expect(
      verifyPassword(nextPassword, row?.password_hash ?? ""),
    ).resolves.toBe(true);
  });
});

describe("deleteUser", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("removes the user so a later email lookup returns null", async () => {
    const created = await createUser(validInput);

    await deleteUser(created.id);

    expect(mockDb.rows).toHaveLength(0);
    await expect(findUserByEmail("jane@school.edu")).resolves.toBeNull();
  });
});

describe("user service SQL", () => {
  beforeEach(() => {
    mockDb.reset();
    vi.clearAllMocks();
  });

  it("uses numbered bound parameters and does not concatenate user input into SQL", async () => {
    const created = await createUser({
      firstName: "Jane'; DROP TABLE users;--",
      lastName: "Doe",
      email: "jane@school.edu",
      password: "correct-horse-battery",
    });

    await updateUser(created.id, { lastName: "Smith" });
    await deleteUser(created.id);

    expect(mockDb.calls.length).toBeGreaterThan(0);
    for (const call of mockDb.calls) {
      expect(call.sql).toMatch(/\?1/);
      expect(call.sql).not.toMatch(/\?;/);
      expect(call.sql).not.toContain("Jane'; DROP TABLE users;--");
      expect(call.sql).not.toContain("jane@school.edu");
      expect(call.sql).not.toContain("correct-horse-battery");
      expect(call.sql).not.toContain("Smith");
      expect(call.binds.length).toBeGreaterThan(0);
    }
  });
});
