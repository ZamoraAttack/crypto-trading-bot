import { NextRequest, NextResponse } from "next/server";

const CORRECT_PIN = "1748";

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.pin || body.pin !== CORRECT_PIN) {
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("auth-token", "authenticated", {
    httpOnly: true,
    secure:   false,
    maxAge:   60 * 60 * 24,
    sameSite: "lax",
    path:     "/",
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("auth-token");
  return response;
}
