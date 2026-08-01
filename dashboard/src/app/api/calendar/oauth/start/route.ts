import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.redirect(buildAuthUrl());
}
