import { NextResponse } from "next/server";
import { z } from "zod";

import { getScan, saveScan, setProjectBaseline } from "@/lib/qr/store";
import { mirrorCompletedScan } from "@/lib/qr/persistence";
import { readJsonBody, RequestBodyError } from "@/lib/qr/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({ enabled: z.boolean().default(true) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const scan = await getScan(id);
    if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    const payload = payloadSchema.parse(await readJsonBody(request));
    const project = await setProjectBaseline(scan.projectId, payload.enabled ? scan.id : null);
    let syncWarning: string | undefined;
    if (scan.progress.stage === "COMPLETE") {
      try { scan.persistence = await mirrorCompletedScan(scan, { updateLatest: false, updateBaseline: true }); }
      catch { syncWarning = "Baseline saved locally; remote synchronization is unavailable."; scan.persistence = { backend: "supabase", synchronized: false, warning: syncWarning }; }
      await saveScan(scan);
    }
    return NextResponse.json({ project, syncWarning });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid baseline request." }, { status: 400 });
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Baseline could not be updated." }, { status: 400 });
  }
}
