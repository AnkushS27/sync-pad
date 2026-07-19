import { NextResponse } from "next/server";
import { prisma } from "@syncpad/db";
import bcryptjs from "bcryptjs";
import { z } from "zod";
import { authRateLimit } from "@/lib/request-guard";

const RegisterSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const limited = authRateLimit(req);
    if (limited) return limited;

    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid registration data" },
        { status: 400 },
      );
    }

    const { email, password, name } = parsed.data;

    // Direct check for existing user
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Generic error message to prevent email harvesting
      return NextResponse.json(
        { error: "Registration failed. Please check your credentials." },
        { status: 400 },
      );
    }

    const passwordHash = await bcryptjs.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name || null,
      },
    });

    return NextResponse.json({ success: true, userId: user.id }, { status: 201 });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}
