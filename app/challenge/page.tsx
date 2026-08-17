import type { Metadata } from "next";

import { ChallengeForm } from "@/components/qr/challenge-form";

export const metadata: Metadata = {
  title: "Beat Your Stack — ALT QR",
  description: "Compare a production baseline with a candidate release and verify candidate-only regressions.",
};

export default function ChallengePage() {
  return (
    <main id="main-content" className="control-page challenge-entry-page">
      <header className="challenge-entry__heading">
        <span className="eyebrow">ALT QR Challenge</span>
        <h1>Beat Your Stack</h1>
        <p><strong>Your QA says the release is safe.</strong> Give ALT QR the same release. We&apos;ll try to prove it wrong.</p>
      </header>
      <ChallengeForm />
      <section className="challenge-contract" aria-labelledby="contract-heading">
        <div><span className="eyebrow">The contract</span><h2 id="contract-heading">One claim. Independent evidence.</h2></div>
        <ol><li><b>01</b><span>Your QA evaluates the release.</span></li><li><b>02</b><span>ALT QR evaluates the same release against production.</span></li><li><b>03</b><span>If we confirm a regression it missed, you have a QA blind spot.</span></li></ol>
      </section>
    </main>
  );
}
