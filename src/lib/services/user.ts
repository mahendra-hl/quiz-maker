import { z } from "zod";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export class UserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserValidationError";
  }
}

export class DuplicateEmailError extends Error {
  constructor(message = "An account with this email already exists.") {
    super(message);
    this.name = "DuplicateEmailError";
  }
}

export class UserNotFoundError extends Error {
  constructor(message = "User not found.") {
    super(message);
    this.name = "UserNotFoundError";
  }
}

export type UserRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
};

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
};

const createUserSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z
    .string()
    .trim()
    .min(1)
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8),
});

const updateUserSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  email: z
    .string()
    .trim()
    .min(1)
    .email()
    .max(254)
    .transform((value) => value.toLowerCase())
    .optional(),
  password: z.string().min(8).optional(),
});

export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;

function parseOrThrow<T>(
  schema: z.ZodType<T>,
  input: unknown,
): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new UserValidationError(
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }
  return parsed.data;
}

function toUser(row: UserRow): UserRecord {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    passwordHash: row.password_hash,
  };
}

async function findUserRowByEmail(email: string): Promise<UserRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT id, first_name, last_name, email, password_hash FROM users WHERE email = ?1",
    )
    .bind(email)
    .all<UserRow>();

  return results[0] ?? null;
}

async function findUserRowById(id: string): Promise<UserRow | null> {
  const db = await getDb();
  const { results } = await db
    .prepare(
      "SELECT id, first_name, last_name, email, password_hash FROM users WHERE id = ?1",
    )
    .bind(id)
    .all<UserRow>();

  return results[0] ?? null;
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const data = parseOrThrow(createUserSchema, input);
  const existing = await findUserRowByEmail(data.email);
  if (existing) {
    throw new DuplicateEmailError();
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(data.password);
  const db = await getDb();
  await db
    .prepare(
      "INSERT INTO users (id, first_name, last_name, email, password_hash) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
    .bind(id, data.firstName, data.lastName, data.email, passwordHash)
    .run();

  const created = await findUserRowById(id);
  if (!created) {
    throw new Error("Failed to load the user after create.");
  }
  return toUser(created);
}

export async function findUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const row = await findUserRowByEmail(normalized);
  return row ? toUser(row) : null;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<UserRecord> {
  const data = parseOrThrow(updateUserSchema, input);
  const current = await findUserRowById(id);
  if (!current) {
    throw new UserNotFoundError();
  }

  const nextEmail = data.email ?? current.email;
  if (nextEmail !== current.email) {
    const taken = await findUserRowByEmail(nextEmail);
    if (taken) {
      throw new DuplicateEmailError();
    }
  }

  const nextPasswordHash = data.password
    ? await hashPassword(data.password)
    : current.password_hash;

  const db = await getDb();
  await db
    .prepare(
      "UPDATE users SET first_name = ?1, last_name = ?2, email = ?3, password_hash = ?4, updated_at = CURRENT_TIMESTAMP WHERE id = ?5",
    )
    .bind(
      data.firstName ?? current.first_name,
      data.lastName ?? current.last_name,
      nextEmail,
      nextPasswordHash,
      id,
    )
    .run();

  const updated = await findUserRowById(id);
  if (!updated) {
    throw new UserNotFoundError();
  }
  return toUser(updated);
}

export async function deleteUser(id: string): Promise<void> {
  const db = await getDb();
  await db.prepare("DELETE FROM users WHERE id = ?1").bind(id).run();
}
