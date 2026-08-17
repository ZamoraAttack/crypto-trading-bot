import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const correctPin = process.env.DASHBOARD_PIN;
  if (!correctPin) {
    return NextResponse.json({ error: "Server misconfigured: DASHBOARD_PIN not set" }, { status: 500 });
  }

  const body = await request.json();

  if (!body.pin || body.pin !== correctPin) {
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
