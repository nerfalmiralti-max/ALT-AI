import { NextResponse } from "next/server";

import { listProjects, recentScans } from "@/lib/qr/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [projects, scans] = await Promise.all([listProjects(), recentScans(50)]);
  return NextResponse.json({ projects, scans });
}
