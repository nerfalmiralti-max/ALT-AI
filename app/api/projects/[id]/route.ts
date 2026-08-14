import { NextResponse } from "next/server";
import { z } from "zod";

import { getProject, getScan, saveScan, updateProjectGate } from "@/lib/qr/store";
import { reanalyzeCompletedScan } from "@/lib/qr/worker";
import { mirrorCompletedScan } from "@/lib/qr/persistence";
import { readJsonBody, RequestBodyError } from "@/lib/qr/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const gateSchema = z.object({
  minimumScore: z.number().int().min(0).max(100).optional(),
  failOnCritical: z.boolean().optional(),
  maximumBrokenPages: z.number().int().min(0).max(25).optional(),
  maximumBrokenLinks: z.number().int().min(0).max(100).optional(),
  scanId: z.string().uuid().optional(),
}).refine((payload) => Object.keys(payload).some((key) => key !== "scanId"));

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await getProject(id);
    if (!existing) return NextResponse.json({ error: "Project not found." }, { status: 404 });
    const payload = gateSchema.parse(await readJsonBody(request));
    const { scanId, ...patch } = payload;
    if (scanId) {
      const requestedScan = await getScan(scanId);
      if (!requestedScan || requestedScan.projectId !== existing.id) return NextResponse.json({ error: "Scan not found for this project." }, { status: 404 });
    }
    const project = await updateProjectGate(existing.id, patch);
    const targetScanId = scanId ?? project.latestScanId;
    const scan = targetScanId ? await reanalyzeCompletedScan(targetScanId).catch(() => null) : null;
    let syncWarning: string | undefined;
    if (scan) {
      try { scan.persistence = await mirrorCompletedScan(scan, { updateLatest: scan.id === project.latestScanId }); }
      catch { syncWarning = "Release gate saved locally; remote synchronization is unavailable."; scan.persistence = { backend: "supabase", synchronized: false, warning: syncWarning }; }
      await saveScan(scan);
    }
    return NextResponse.json({ project, scan, syncWarning });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid release-gate configuration." }, { status: 400 });
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: "Release gate could not be updated." }, { status: 400 });
  }
}
