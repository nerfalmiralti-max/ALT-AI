import { NextResponse } from "next/server";

import { presentChallenge } from "@/lib/qr/challenge-presentation";
import { cancelChallenge, recoverInterruptedChallenge } from "@/lib/qr/challenge-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const challenge = await recoverInterruptedChallenge(id);
    if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
    return NextResponse.json({ challenge: await presentChallenge(challenge) });
  } catch {
    return NextResponse.json({ error: "Stored challenge data is unreadable." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const challenge = await cancelChallenge(id);
  if (!challenge) return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  return NextResponse.json({ challenge: await presentChallenge(challenge) });
}
