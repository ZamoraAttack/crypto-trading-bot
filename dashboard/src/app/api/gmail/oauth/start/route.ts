import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.redirect(buildAuthUrl());
}
