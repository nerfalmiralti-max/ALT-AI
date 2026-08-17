import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChallengeReport } from "@/components/qr/challenge-report";
import { presentChallenge } from "@/lib/qr/challenge-presentation";
import { getChallenge } from "@/lib/qr/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Challenge Evidence Report — ALT QR" };

export default async function ChallengeReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const challenge = await getChallenge(id);
  if (!challenge) notFound();
  return <main id="main-content" className="control-page challenge-print-page"><nav className="challenge-toolbar"><Link href={`/challenge/${id}`}>Back to challenge</Link><span>Use your browser&apos;s print command to export PDF.</span></nav><ChallengeReport challenge={await presentChallenge(challenge)} reportView /></main>;
}
