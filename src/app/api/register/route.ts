import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createUser,
  DuplicateEmailError,
  UserValidationError,
} from "@/lib/services/user";

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().min(1).email().max(254),
  password: z.string().min(8),
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

    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 },
      );
    }

    const user = await createUser(parsed.data);
    return NextResponse.json({ user: toPublicUser(user) }, { status: 201 });
  } catch (error) {
    if (error instanceof UserValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof DuplicateEmailError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("POST /api/register failed", error);

    const message =
      process.env.NODE_ENV !== "production" && error instanceof Error
        ? error.message
        : "Internal server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
