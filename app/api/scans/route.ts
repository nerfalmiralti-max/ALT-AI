import { NextResponse } from "next/server";
import { z } from "zod";

import { rateLimit } from "@/lib/rate-limit";
import { assertSafeTarget, TargetUrlError } from "@/lib/qr/security";
import { readJsonBody, RequestBodyError } from "@/lib/qr/request";
import { createScan, recentScans } from "@/lib/qr/store";
import { isCrawlableUrl, normalizeTargetInput, normalizeUrl } from "@/lib/qr/url";
import { recoverInterruptedScan, releaseScanSlot, reserveScanSlot, startScan } from "@/lib/qr/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z.object({ url: z.string().trim().min(1).max(2_048) });

export async function GET() {
  const scans = await recentScans(16);
  const recovered = await Promise.all(scans.map((scan) => recoverInterruptedScan(scan.id)));
  return NextResponse.json({ scans: recovered.filter(Boolean) });
}

export async function POST(request: Request) {
  const forwardedClient = process.env.ALT_QR_TRUST_PROXY_HEADERS === "true" ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined;
  const clientKey = forwardedClient || "untrusted-ingress";
  const limited = rateLimit(`scan:${clientKey}`, 6, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many scans were started. Wait a moment and try again." },
      { status: 429, headers: { "retry-after": String(Math.ceil(limited.retryAfterMs / 1_000)) } },
    );
  }
  const reservation = reserveScanSlot();
  if (!reservation) {
    return NextResponse.json(
      { error: "The scanner is busy. Wait for the active scan to finish and try again." },
      { status: 429, headers: { "retry-after": "5" } },
    );
  }
  try {
    const payload = payloadSchema.parse(await readJsonBody(request, 4_096));
    const targetUrl = normalizeTargetInput(payload.url);
    const safeUrl = await assertSafeTarget(targetUrl);
    const normalizedUrl = normalizeUrl(safeUrl.toString());
    if (!isCrawlableUrl(normalizedUrl, new URL(normalizedUrl).origin)) throw new TargetUrlError("UNSAFE_PATH", "Executable, download, and destructive-action URLs cannot be scan targets.");
    const scan = await createScan(payload.url, normalizedUrl);
    void startScan(scan.id, reservation);
    return NextResponse.json({ scanId: scan.id, projectId: scan.projectId }, { status: 202 });
  } catch (error) {
    releaseScanSlot(reservation);
    if (error instanceof TargetUrlError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Enter a valid website URL." }, { status: 400 });
    return NextResponse.json({ error: "The scan could not be started." }, { status: 500 });
  }
}
