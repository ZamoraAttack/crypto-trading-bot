import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/calendar";

export async function GET() {
  return NextResponse.redirect(buildAuthUrl());
}
