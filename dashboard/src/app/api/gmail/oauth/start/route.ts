import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/gmail";

export async function GET() {
  return NextResponse.redirect(buildAuthUrl());
}
