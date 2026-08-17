import { NextResponse } from "next/server";

import { rateLimit } from "@/lib/rate-limit";
import { ChallengeCapacityError, enqueueChallengeRun, releaseChallengeSlot, reserveChallengeSlot } from "@/lib/qr/challenge-worker";
import { getChallenge } from "@/lib/qr/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = rateLimit("challenge:rerun", 10, 60_000);
  if (!limited.ok) return NextResponse.json({ error: "Challenge reruns are temporarily limited. Wait a moment and try again." }, { status: 429, headers: { "retry-after": String(Math.ceil(limited.retryAfterMs / 1_000)) } });
  const reservation = reserveChallengeSlot();
  if (!reservation) return NextResponse.json({ error: "ALT QR is already running a challenge. Wait for it to finish and try again." }, { status: 429, headers: { "retry-after": "5" } });
  try {
    const { id } = await params;
    if (!await getChallenge(id)) {
      releaseChallengeSlot(reservation);
      return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    }
    const run = await enqueueChallengeRun(id, reservation);
    return NextResponse.json({ challengeId: id, runId: run.id }, { status: 202 });
  } catch (error) {
    releaseChallengeSlot(reservation);
    if (error instanceof ChallengeCapacityError) return NextResponse.json({ error: error.message }, { status: 429, headers: { "retry-after": "5" } });
    return NextResponse.json({ error: "The challenge rerun could not be started." }, { status: 500 });
  }
}
