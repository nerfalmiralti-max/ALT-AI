import { NextResponse } from "next/server";
import { z } from "zod";

import { rateLimit } from "@/lib/rate-limit";
import { presentChallenge } from "@/lib/qr/challenge-presentation";
import { ChallengeCapacityError, enqueueChallengeRun, releaseChallengeSlot, reserveChallengeSlot } from "@/lib/qr/challenge-worker";
import { readJsonBody, RequestBodyError } from "@/lib/qr/request";
import { assertSafeTarget, TargetUrlError } from "@/lib/qr/security";
import { createChallenge, listChallenges, StorageCapacityError } from "@/lib/qr/store";
import { isCrawlableUrl, normalizeTargetInput, normalizeUrl } from "@/lib/qr/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const optionalUrl = z.string().trim().max(2_048).optional().transform((value) => value || undefined);
const payloadSchema = z.object({
  productionUrl: z.string().trim().min(1).max(2_048),
  candidateUrl: z.string().trim().min(1).max(2_048),
  pullRequestUrl: optionalUrl,
  qaStack: z.string().trim().max(300).optional().transform((value) => value || undefined),
  existingQaVerdict: z.enum(["PASSED", "FAILED", "UNKNOWN"]).default("UNKNOWN"),
});

async function safeChallengeTarget(raw: string) {
  const target = normalizeTargetInput(raw);
  const safe = await assertSafeTarget(target);
  const normalized = normalizeUrl(safe.toString());
  if (!isCrawlableUrl(normalized, new URL(normalized).origin)) {
    throw new TargetUrlError("UNSAFE_PATH", "Executable, download, and destructive-action URLs cannot be challenge targets.");
  }
  return normalized;
}

function safePullRequestUrl(raw: string | undefined) {
  if (!raw) return undefined;
  let url: URL;
  try { url = new URL(raw); } catch { throw new TargetUrlError("INVALID_PR_URL", "Enter a complete HTTP or HTTPS pull request URL."); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new TargetUrlError("INVALID_PR_URL", "Enter a complete HTTP or HTTPS pull request URL without credentials.");
  }
  url.hash = "";
  return url.toString();
}

function challengeError(error: unknown) {
  if (error instanceof TargetUrlError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof z.ZodError) return NextResponse.json({ error: "Check the challenge URLs and optional details." }, { status: 400 });
  if (error instanceof ChallengeCapacityError) return NextResponse.json({ error: "ALT QR is already running a challenge. Wait for it to finish and try again." }, { status: 429, headers: { "retry-after": "5" } });
  if (error instanceof StorageCapacityError) return NextResponse.json({ error: error.message }, { status: 507 });
  return NextResponse.json({ error: "The challenge could not be started." }, { status: 500 });
}

export async function GET() {
  try {
    const challenges = await listChallenges(12);
    return NextResponse.json({ challenges: await Promise.all(challenges.map(presentChallenge)) });
  } catch {
    return NextResponse.json({ error: "Stored challenge data is unreadable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const intake = rateLimit("challenge:intake", 10, 60_000);
  if (!intake.ok) {
    return NextResponse.json({ error: "Challenge intake is temporarily full. Wait a moment and try again." }, { status: 429, headers: { "retry-after": String(Math.ceil(intake.retryAfterMs / 1_000)) } });
  }
  const reservation = reserveChallengeSlot();
  if (!reservation) return NextResponse.json({ error: "ALT QR is already running a challenge. Wait for it to finish and try again." }, { status: 429, headers: { "retry-after": "5" } });
  try {
    const payload = payloadSchema.parse(await readJsonBody(request, 8_192, 5_000));
    const [productionUrl, candidateUrl] = await Promise.all([
      safeChallengeTarget(payload.productionUrl),
      safeChallengeTarget(payload.candidateUrl),
    ]);
    if (productionUrl === candidateUrl) throw new TargetUrlError("IDENTICAL_TARGETS", "Production and candidate URLs must be different.");
    const challenge = await createChallenge({
      productionUrl,
      candidateUrl,
      pullRequestUrl: safePullRequestUrl(payload.pullRequestUrl),
      qaStack: payload.qaStack,
      existingQaVerdict: payload.existingQaVerdict,
    });
    const run = await enqueueChallengeRun(challenge.id, reservation);
    return NextResponse.json({ challengeId: challenge.id, runId: run.id }, { status: 202 });
  } catch (error) {
    releaseChallengeSlot(reservation);
    return challengeError(error);
  }
}
