import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ChallengeWorkspace } from "@/components/qr/challenge-workspace";
import { presentChallenge } from "@/lib/qr/challenge-presentation";
import { recoverInterruptedChallenge } from "@/lib/qr/challenge-worker";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Challenge Result — ALT QR" };

export default async function ChallengeResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const challenge = await recoverInterruptedChallenge(id);
  if (!challenge) notFound();
  return <ChallengeWorkspace initialChallenge={await presentChallenge(challenge)} />;
}
