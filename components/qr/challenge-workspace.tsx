"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ChallengePresentation } from "@/lib/qr/challenge-presentation";
import { ArrowIcon, ChallengeIcon, ScanIcon } from "./icons";
import { ChallengeReport } from "./challenge-report";

const TERMINAL = new Set(["COMPLETE", "FAILED", "CANCELLED"]);

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function verdictLabel(value: string | undefined) {
  return value?.replaceAll("_", " ") ?? "IN PROGRESS";
}

export function ChallengeWorkspace({ initialChallenge }: { initialChallenge: ChallengePresentation }) {
  const [challenge, setChallenge] = useState(initialChallenge);
  const [error, setError] = useState("");
  const [action, setAction] = useState<"rerun" | "cancel" | "">("");
  const latest = challenge.runs.at(-1);
  const active = Boolean(latest && !TERMINAL.has(latest.progress.stage));

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch(`/api/challenges/${challenge.id}`, { cache: "no-store" });
        const body = await response.json() as { challenge?: ChallengePresentation; error?: string };
        if (!response.ok || !body.challenge) throw new Error(body.error ?? "Challenge status is unavailable.");
        if (!disposed) {
          setChallenge(body.challenge);
          setError("");
          const next = body.challenge.runs.at(-1);
          if (next && !TERMINAL.has(next.progress.stage)) timer = setTimeout(poll, 1200);
        }
      } catch (cause) {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : "Challenge status is unavailable.");
          timer = setTimeout(poll, 2500);
        }
      }
    }
    timer = setTimeout(poll, 700);
    return () => { disposed = true; clearTimeout(timer); };
  }, [active, challenge.id, latest?.id]);

  async function rerun() {
    setAction("rerun");
    setError("");
    try {
      const response = await fetch(`/api/challenges/${challenge.id}/runs`, { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The rerun could not be started.");
      const refreshed = await fetch(`/api/challenges/${challenge.id}`, { cache: "no-store" });
      const payload = await refreshed.json() as { challenge?: ChallengePresentation; error?: string };
      if (!refreshed.ok || !payload.challenge) throw new Error(payload.error ?? "Challenge status is unavailable.");
      setChallenge(payload.challenge);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The rerun could not be started."); }
    finally { setAction(""); }
  }

  async function cancel() {
    setAction("cancel");
    setError("");
    try {
      const response = await fetch(`/api/challenges/${challenge.id}`, { method: "DELETE" });
      const body = await response.json() as { challenge?: ChallengePresentation; error?: string };
      if (!response.ok || !body.challenge) throw new Error(body.error ?? "The challenge could not be cancelled.");
      setChallenge(body.challenge);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The challenge could not be cancelled."); }
    finally { setAction(""); }
  }

  const previous = challenge.runs.length > 1 ? challenge.runs.at(-2) : undefined;
  const latestIdentities = new Set([...(latest?.comparison?.newRegressions ?? []), ...(latest?.comparison?.unverifiedChanges ?? [])].map((finding) => finding.identity));
  const latestCandidateRoutes = new Set([
    ...(latest?.scans.candidate?.inspectedRoutes ?? []),
    ...(latest?.redTeamScans.candidate?.inspectedRoutes ?? []),
  ]);
  const priorStatus = previous?.comparison?.newRegressions.map((finding) => ({
    finding,
    status: latest?.comparison?.evidenceComplete && latestCandidateRoutes.has(finding.route) && !latestIdentities.has(finding.identity)
      ? "Fixed in latest rerun"
      : latest?.comparison?.newRegressions.some((entry) => entry.identity === finding.identity)
        ? "Still reproducible"
        : latestCandidateRoutes.has(finding.route) ? "Changed or unverified" : "Not covered in latest rerun",
  })) ?? [];

  return (
    <main id="main-content" className="control-page challenge-workspace-page">
      <nav className="challenge-toolbar" aria-label="Challenge actions"><Link href="/challenge"><ChallengeIcon />New challenge</Link><div>{active ? <button type="button" onClick={cancel} disabled={Boolean(action)}>{action === "cancel" ? "Cancelling…" : "Cancel"}</button> : <button type="button" onClick={rerun} disabled={Boolean(action)}><ScanIcon />{action === "rerun" ? "Starting…" : "Run Challenge Again"}</button>}<Link href={`/challenge/${challenge.id}/report`} target="_blank">Print report<ArrowIcon /></Link></div></nav>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {active && latest ? <section className="challenge-progress" aria-live="polite"><header><span className="eyebrow">Live evidence run</span><h1>{latest.progress.detail}</h1><code>{latest.progress.stage.replaceAll("_", " ")}</code></header><div className="challenge-progress__scans">{[...Object.entries(latest.scans), ...Object.entries(latest.redTeamScans).map(([role, scan]) => [`red-team-${role}`, scan] as const)].map(([role, scan]) => scan ? <article key={role} data-state={scan.progress.stage}><span>{role.replaceAll("-", " ")}</span><strong>{scan.progress.stage.replaceAll("_", " ")}</strong><p>{scan.progress.detail}</p><small>{scan.progress.totalUnits ? `${scan.progress.completedUnits}/${scan.progress.totalUnits} inspected units` : "Waiting for measured units"}</small>{scan.progress.currentUrl ? <code>{scan.progress.currentUrl}</code> : null}</article> : null)}</div>{latest.swarm ? <div className="challenge-progress__swarm"><div className="section-bar"><div><span className="eyebrow">Adversarial verification</span><h2>QA Swarm</h2></div><code>{latest.swarm.stage.replaceAll("_", " ")}</code></div><div>{latest.swarm.roleRuns.map((role) => <article key={role.role} data-status={role.status}><strong>{role.role.replaceAll("_", " ")}</strong><span>{role.status.replaceAll("_", " ")}</span><small>{role.findings.length} suspected</small></article>)}</div><footer><span>Evidence Judge</span><strong>{latest.swarm.preliminaryVerdict?.replaceAll("_", " ") ?? (latest.swarm.stage === "JUDGING" || latest.swarm.stage === "NORMALIZING" ? "REVIEWING" : "PENDING")}</strong><span>Red Team</span><strong>{latest.swarm.redTeam.status.replaceAll("_", " ")}</strong></footer></div> : null}</section> : <ChallengeReport challenge={challenge} />}

      {!active && challenge.runs.length ? <section className="challenge-history" aria-labelledby="challenge-history-heading"><div className="section-bar"><div><span className="eyebrow">Immutable evidence history</span><h2 id="challenge-history-heading">Challenge runs</h2></div><p>Reruns append. Earlier evidence is never overwritten.</p></div>{priorStatus.length ? <div className="prior-regression-status">{priorStatus.map(({ finding, status }) => <div key={finding.identity}><strong>{finding.title}</strong><span>{status}</span></div>)}</div> : null}<div className="challenge-history__list">{[...challenge.runs].reverse().map((run, index) => <article key={run.id}><span>Run {challenge.runs.length - index}</span><strong>{verdictLabel(run.verdict)}</strong><small>{run.comparison?.qualifyingRegressionCount ?? 0} confirmed · {run.swarm?.readyRevoked ? "READY revoked" : run.swarm?.finalVerdict ?? "Phase 1"}</small><time dateTime={run.completedAt ?? run.createdAt}>{formatDate(run.completedAt ?? run.createdAt)}</time><code>{run.id.slice(0, 8)}</code></article>)}</div></section> : null}
    </main>
  );
}
