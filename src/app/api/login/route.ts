import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/password";
import { findUserByEmail } from "@/lib/services/user";

const INVALID_CREDENTIALS = "Invalid email or password.";

const loginSchema = z.object({
  email: z.string().trim().min(1).email().max(254),
  password: z.string().min(1),
});

function toPublicUser(user: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  };
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 },
      );
    }

    const user = await findUserByEmail(parsed.data.email);
    const passwordMatches = user
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches) {
      return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
    }

    return NextResponse.json({ user: toPublicUser(user) }, { status: 200 });
  } catch (error) {
    console.error("POST /api/login failed", error);

    const message =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? error.message
        : "Internal server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
