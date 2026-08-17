"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { ChallengeIcon } from "./icons";

export function ChallengeForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/challenges", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productionUrl: form.get("productionUrl"),
          candidateUrl: form.get("candidateUrl"),
          existingQaVerdict: form.get("existingQaVerdict"),
          qaStack: form.get("qaStack"),
          pullRequestUrl: form.get("pullRequestUrl"),
        }),
      });
      const body = await response.json() as { challengeId?: string; error?: string };
      if (!response.ok || !body.challengeId) throw new Error(body.error ?? "The challenge could not be started.");
      router.push(`/challenge/${body.challengeId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The challenge could not be started.");
      setSubmitting(false);
    }
  }

  return (
    <form className="challenge-form" onSubmit={submit}>
      <div className="challenge-form__pair">
        <label><span>Production URL</span><small>The known-good live version.</small><input name="productionUrl" type="url" inputMode="url" autoComplete="url" placeholder="https://example.com" required maxLength={2048} /></label>
        <label><span>Preview / Candidate URL</span><small>The release being tested.</small><input name="candidateUrl" type="url" inputMode="url" autoComplete="url" placeholder="https://preview.example.com" required maxLength={2048} /></label>
      </div>
      <div className="challenge-form__details">
        <label><span>Current QA verdict</span><small>What did the existing process conclude?</small><select name="existingQaVerdict" defaultValue="UNKNOWN"><option value="UNKNOWN">Unknown</option><option value="PASSED">Passed</option><option value="FAILED">Failed</option></select></label>
        <label><span>Existing QA stack <i>Optional</i></span><small>Playwright, Cypress, Momentic, TestSprite, internal QA…</small><input name="qaStack" type="text" maxLength={300} /></label>
        <label><span>PR URL <i>Optional</i></span><small>Link this result to the release context.</small><input name="pullRequestUrl" type="url" inputMode="url" maxLength={2048} /></label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="primary-action challenge-submit" type="submit" disabled={submitting}><ChallengeIcon />{submitting ? "Starting challenge…" : "Run Challenge"}</button>
    </form>
  );
}
