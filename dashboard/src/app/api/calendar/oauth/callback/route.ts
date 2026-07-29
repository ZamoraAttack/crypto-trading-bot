import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/calendar";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/connectors?calendar_error=${encodeURIComponent(error)}`, request.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/connectors?calendar_error=missing_code", request.url));
  }

  try {
    await exchangeCodeForToken(code);
    return NextResponse.redirect(new URL("/connectors?calendar_connected=1", request.url));
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(new URL(`/connectors?calendar_error=${encodeURIComponent(message)}`, request.url));
  }
}
