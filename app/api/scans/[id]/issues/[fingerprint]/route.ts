import { NextResponse } from "next/server";
import { z } from "zod";

import { getScan, saveScan, setIgnoredFingerprint } from "@/lib/qr/store";
import { reanalyzeCompletedScan } from "@/lib/qr/worker";
import { mirrorCompletedScan } from "@/lib/qr/persistence";
import { readJsonBody, RequestBodyError } from "@/lib/qr/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({ ignored: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; fingerprint: string }> }) {
  try {
    const { id, fingerprint } = await params;
    const scan = await getScan(id);
    if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    if (!scan.issues.some((issue) => issue.fingerprint === fingerprint)) return NextResponse.json({ error: "Finding not found." }, { status: 404 });
    const payload = payloadSchema.parse(await readJsonBody(request));
    await setIgnoredFingerprint(scan.projectId, fingerprint, payload.ignored);
    const updated = await reanalyzeCompletedScan(scan.id);
    let syncWarning: string | undefined;
    try { updated.persistence = await mirrorCompletedScan(updated, { updateLatest: false }); }
    catch { syncWarning = "Finding state saved locally; remote synchronization is unavailable."; updated.persistence = { backend: "supabase", synchronized: false, warning: syncWarning }; }
    await saveScan(updated);
    return NextResponse.json({ scan: updated, syncWarning });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid issue lifecycle request." }, { status: 400 });
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Finding lifecycle could not be updated." }, { status: 400 });
  }
}
