import { NextResponse } from "next/server";

import { getBaselineCompletedScan, getPreviousCompletedScan, getProject, getScan } from "@/lib/qr/store";
import type { ScanRecord } from "@/lib/qr/types";
import { cancelScan, reanalyzeCompletedScan, recoverInterruptedScan } from "@/lib/qr/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let scan = await recoverInterruptedScan(id);
    if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
    const project = await getProject(scan.projectId);
    if (project && scan.progress.stage === "COMPLETE" && scan.analysisProjectUpdatedAt !== project.updatedAt) {
      scan = await reanalyzeCompletedScan(scan.id);
    }
    const [previous, baseline] = await Promise.all([
      getPreviousCompletedScan(scan.projectId, scan.id),
      getBaselineCompletedScan(scan.projectId),
    ]);
    const history = project
      ? (await Promise.all(project.scanIds.slice(0, 20).map(getScan))).filter((item): item is ScanRecord => Boolean(item)).map((item) => ({
        id: item.id,
        normalizedUrl: item.normalizedUrl,
        createdAt: item.createdAt,
        completedAt: item.completedAt,
        stage: item.progress.stage,
        score: item.score?.overall,
        verdict: item.verdict,
        scoreDelta: item.comparisons.previous?.scoreDelta,
        }))
      : [];
    return NextResponse.json({
      scan,
      project,
      history,
      previous: previous ? { id: previous.id, screenshots: previous.screenshots, score: previous.score, verdict: previous.verdict, completedAt: previous.completedAt } : null,
      baseline: baseline ? { id: baseline.id, screenshots: baseline.screenshots, score: baseline.score, verdict: baseline.verdict, completedAt: baseline.completedAt } : null,
    });
  } catch {
    return NextResponse.json({ error: "Stored scan data is unreadable. Restore the last known-good local backup or start a new scan." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await cancelScan(id);
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  return NextResponse.json({ scan });
}
