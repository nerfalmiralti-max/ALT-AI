import Image from "next/image";

import type { ChallengeFinding } from "@/lib/qr/types";
import type { ChallengePresentation } from "@/lib/qr/challenge-presentation";

type PresentedRun = ChallengePresentation["runs"][number];

function formatDate(value: string | undefined) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Pending";
}

function host(value: string) {
  try { return new URL(value).hostname; } catch { return value; }
}

function qaLabel(value: ChallengePresentation["existingQaVerdict"]) {
  return value === "PASSED" ? "PASS" : value === "FAILED" ? "FAIL" : "UNKNOWN";
}

function altLabel(run: PresentedRun | undefined) {
  if (!run || !["COMPLETE", "FAILED", "CANCELLED"].includes(run.progress.stage)) return "RUNNING";
  if (run.swarm?.finalVerdict === "HOLD") return "HOLD";
  if (run.swarm?.finalVerdict === "READY") return "READY";
  if (run.swarm?.finalVerdict === "INCOMPLETE") return "INCONCLUSIVE";
  if (run.verdict === "ALT_QR_WON" || run.verdict === "RELEASE_HAS_REGRESSIONS") return "HOLD";
  if (run.verdict === "NO_QUALIFYING_MISS") return "NO HOLD";
  return "INCONCLUSIVE";
}

function findingProvenance(run: PresentedRun | undefined, identity: string) {
  if (!run?.swarm) return null;
  const primary = run.swarm.rawFindings.filter((finding) => finding.issueIdentity === identity);
  const redTeam = run.swarm.redTeam.rawFindings.filter((finding) => finding.issueIdentity === identity);
  const roles = [...new Set(primary.map((finding) => finding.role))];
  const decisions = [...run.swarm.judgeDecisions, ...run.swarm.redTeam.decisions]
    .filter((decision) => [...primary, ...redTeam].some((finding) => finding.id === decision.rawFindingId));
  return {
    roles,
    redTeam: redTeam.length > 0,
    confirmed: decisions.some((decision) => decision.disposition === "CONFIRMED"),
  };
}

function resultCopy(run: PresentedRun | undefined) {
  const count = run?.comparison?.qualifyingRegressionCount ?? 0;
  if (!run || !run.verdict) return { label: "Challenge in progress", title: "ALT QR is collecting evidence.", body: "The verdict remains open until baseline, candidate, and required verification work completes." };
  if (run.verdict === "ALT_QR_WON") return { label: "ALT QR WON", title: "ALT QR found what your QA missed.", body: `${count} confirmed ${count === 1 ? "regression was" : "regressions were"} not reported by the existing QA result.` };
  if (run.verdict === "RELEASE_HAS_REGRESSIONS") return { label: "Release has regressions", title: "Candidate regressions confirmed.", body: `${count} candidate-only ${count === 1 ? "regression was" : "regressions were"} reproduced. The submitted QA result was not Passed, so this is not counted as a stack miss.` };
  if (run.verdict === "NO_QUALIFYING_MISS") return { label: "No qualifying miss found", title: "We couldn’t beat your stack on this release.", body: "No qualifying candidate-only regression was confirmed with sufficient evidence." };
  return { label: "Insufficient evidence", title: "The evidence is not strong enough for a verdict.", body: "A critical scan or comparison step was incomplete. ALT QR made no pass or competitive claim." };
}

function preliminaryLabel(run: PresentedRun | undefined) {
  return run?.swarm?.preliminaryVerdict === "PRELIMINARY_READY" ? "READY" : run?.swarm?.preliminaryVerdict === "PRELIMINARY_HOLD" ? "HOLD" : "INCOMPLETE";
}

function redTeamSummary(run: PresentedRun | undefined) {
  const redTeam = run?.swarm?.redTeam;
  if (!redTeam) return "NOT RUN";
  if (redTeam.status === "BLOCKER_FOUND") return `${redTeam.decisions.filter((entry) => entry.disposition === "CONFIRMED" && entry.releaseBlocker).length} BLOCKER`;
  if (redTeam.status === "CLEAR") return "CLEAR";
  return redTeam.status.replaceAll("_", " ");
}

function evidenceLine(finding: ChallengeFinding) {
  const evidence = finding.candidateEvidence ?? finding.productionEvidence;
  if (!evidence) return "No bounded evidence excerpt available.";
  if (typeof evidence.httpStatus === "number") return `HTTP ${evidence.httpStatus}`;
  if (evidence.consoleMessage) return evidence.consoleMessage;
  if (evidence.requestUrl) return evidence.requestUrl;
  if (evidence.excerpt) return evidence.excerpt;
  if (evidence.selector) return evidence.selector;
  if (evidence.dimensions) return `${evidence.dimensions.documentWidth}px document / ${evidence.dimensions.viewportWidth}px viewport`;
  return "Scanner rule evidence attached to the affected route.";
}

function Finding({ finding, featured = false, provenance }: { finding: ChallengeFinding; featured?: boolean; provenance?: ReturnType<typeof findingProvenance> }) {
  return (
    <article className="challenge-finding" data-classification={finding.classification} data-featured={featured ? "true" : undefined} id={`finding-${finding.identity}`}>
      <header><div><span>{finding.classification === "NEW_REGRESSION" ? "Candidate only" : finding.classification.replaceAll("_", " ")}</span><h3>{finding.title}</h3>{provenance ? <div className="finding-provenance">{provenance.redTeam ? <b>Red Team discovery</b> : provenance.roles.map((role, index) => <b key={role}>{index === 0 ? "Found by" : "Also observed by"} {role.replaceAll("_", " ")}</b>)}{provenance.redTeam ? <b>Not detected during primary verification</b> : null}{provenance.confirmed ? <b>Confirmed independently</b> : null}</div> : null}</div><div className="finding-badges"><b>{finding.severity}</b>{finding.classification === "NEW_REGRESSION" || finding.classification === "UNVERIFIED" ? <b data-confidence={finding.confidence}>{finding.confidence}</b> : null}{finding.reproduction.attempts > 1 ? <b>Reproduced {finding.reproduction.observed}/{finding.reproduction.attempts}</b> : null}</div></header>
      <div className="challenge-delta">
        <section><span>Production</span><p>{finding.productionState}</p>{finding.productionEvidence ? <code>{finding.productionEvidence.httpStatus ? `HTTP ${finding.productionEvidence.httpStatus}` : finding.productionEvidence.excerpt ?? finding.productionEvidence.consoleMessage ?? finding.route}</code> : null}</section>
        <section><span>Candidate</span><p>{finding.candidateState}</p><code>{evidenceLine(finding)}</code></section>
        <section><span>Delta</span><p>{finding.reason}</p><code>{finding.route}{finding.affectedInteraction ? ` · ${finding.affectedInteraction}` : ""}</code></section>
      </div>
      <footer><span>Technical reason</span><p>{finding.description} {finding.recommendation}</p></footer>
    </article>
  );
}

function FindingSection({ id, title, description, findings, run }: { id: string; title: string; description: string; findings: ChallengeFinding[]; run?: PresentedRun }) {
  return (
    <section className="challenge-evidence-section" id={id}>
      <div className="section-bar"><div><span className="eyebrow">{findings.length} recorded</span><h2>{title}</h2></div><p>{description}</p></div>
      {findings.length ? <div className="challenge-findings">{findings.map((finding) => <Finding key={finding.identity} finding={finding} provenance={findingProvenance(run, finding.identity)} />)}</div> : <p className="challenge-empty-line">None recorded in this run.</p>}
    </section>
  );
}

function SwarmExecution({ run }: { run: PresentedRun }) {
  const swarm = run.swarm;
  if (!swarm) return null;
  const primaryLabel = swarm.preliminaryVerdict === "PRELIMINARY_READY" ? "READY" : swarm.preliminaryVerdict === "PRELIMINARY_HOLD" ? "HOLD" : "INCOMPLETE";
  const redTeamLabel = swarm.redTeam.status === "BLOCKER_FOUND" ? `${swarm.redTeam.decisions.filter((entry) => entry.disposition === "CONFIRMED" && entry.releaseBlocker).length} blocker confirmed` : swarm.redTeam.status === "CLEAR" ? "No blocker confirmed" : swarm.redTeam.status.replaceAll("_", " ");
  return (
    <section className="challenge-swarm" aria-labelledby="swarm-heading">
      <div className="section-bar"><div><span className="eyebrow">Adversarial QA engine</span><h2 id="swarm-heading">ALT QR challenged its first answer</h2></div><p>Role evidence stayed isolated until Judge review.</p></div>
      <div className="challenge-verdict-flow">
        <article><span>Primary verification</span><strong>{primaryLabel}</strong><small>{swarm.counts.releaseBlockers} release blockers</small></article>
        <article data-red-team={swarm.redTeam.status}><span>Red Team</span><strong>{redTeamLabel}</strong><small>{swarm.redTeam.targetRoutes.join(", ") || "No adversarial route"}</small></article>
        <article data-final={swarm.finalVerdict}><span>Final verdict</span><strong>{swarm.finalVerdict ?? "PENDING"}</strong><small>{swarm.adversariallyVerified ? "Adversarially verified" : "Verification incomplete or not required"}</small></article>
      </div>
      {swarm.readyRevoked ? <p className="challenge-revocation"><strong>Preliminary READY revoked.</strong> Red Team independently reproduced a release blocker missed by the primary pass.</p> : null}
      <div className="swarm-ledger">
        <div className="swarm-ledger__roles">
          <header><span>QA Swarm</span><strong>{swarm.roleRuns.length} independent roles</strong></header>
          {swarm.roleRuns.map((role) => {
            const confirmed = swarm.judgeDecisions.filter((decision) => decision.disposition === "CONFIRMED" && decision.roles.includes(role.role)).length;
            return <article key={role.role} data-status={role.status}><div><strong>{role.role.replaceAll("_", " ")}</strong><small>{role.mission}</small></div><span>{role.status.replaceAll("_", " ")}</span><code>{role.findings.length} suspected · {confirmed} confirmed</code></article>;
          })}
        </div>
        <div className="judge-ledger">
          <header><span>Evidence Judge</span><strong>Independent review</strong></header>
          <dl>
            <div><dt>Suspected</dt><dd>{swarm.counts.discovered}</dd></div>
            <div><dt>Normalized</dt><dd>{swarm.counts.normalized}</dd></div>
            <div><dt>Confirmed</dt><dd>{swarm.counts.confirmed}</dd></div>
            <div><dt>Rejected / merged</dt><dd>{swarm.counts.rejected + swarm.counts.duplicates}</dd></div>
            <div><dt>Baseline / environmental</dt><dd>{swarm.counts.baselineIssues + swarm.counts.environmental}</dd></div>
            <div><dt>Unverified</dt><dd>{swarm.counts.unverified}</dd></div>
          </dl>
        </div>
      </div>
    </section>
  );
}

export function ChallengeReport({ challenge, reportView = false }: { challenge: ChallengePresentation; reportView?: boolean }) {
  const run = challenge.runs.at(-1);
  const copy = resultCopy(run);
  const strongest = run?.comparison?.newRegressions[0];
  const count = run?.comparison?.qualifyingRegressionCount ?? 0;
  return (
    <div className="challenge-report" data-report-view={reportView ? "true" : undefined}>
      <header className="challenge-result" data-verdict={run?.verdict ?? run?.progress.stage ?? "QUEUED"}>
        <div className="challenge-result__meta"><span>{copy.label}</span><time dateTime={run?.completedAt ?? run?.createdAt}>{formatDate(run?.completedAt ?? run?.createdAt)}</time></div>
        <div className="challenge-confrontation" aria-label="Existing QA compared with ALT QR">
          <section><span>Your QA</span><strong>{qaLabel(challenge.existingQaVerdict)}</strong><small>{challenge.qaStack ?? "Submitted QA result"}</small></section>
          <div aria-hidden="true">versus</div>
          <section><span>ALT QR</span><strong>{altLabel(run)}</strong><small>{count} confirmed {count === 1 ? "regression" : "regressions"}</small></section>
        </div>
        {run?.swarm ? <div className="challenge-adversarial-strip" aria-label="Primary, Red Team, and final verification states"><div><span>ALT QR primary</span><strong>{preliminaryLabel(run)}</strong></div><div><span>Red Team</span><strong>{redTeamSummary(run)}</strong></div><div><span>Final</span><strong>{run.swarm.finalVerdict ?? "PENDING"}</strong></div>{run.swarm.readyRevoked ? <p><b>Preliminary READY revoked.</b> Red Team independently reproduced a release blocker.</p> : run.swarm.adversariallyVerified ? <p>Configured primary and adversarial verification completed.</p> : <p>Adversarial evidence is incomplete or was not required.</p>}</div> : null}
        <div className="challenge-result__copy"><h1>{copy.title}</h1><p>{copy.body}</p>{run?.verdict === "ALT_QR_WON" ? <strong>{count} QA blind {count === 1 ? "spot" : "spots"} exposed</strong> : null}</div>
        <dl className="challenge-summary"><div><dt>Production</dt><dd title={challenge.productionUrl}>{host(challenge.productionUrl)}</dd></div><div><dt>Candidate</dt><dd title={challenge.candidateUrl}>{host(challenge.candidateUrl)}</dd></div><div><dt>Run</dt><dd>{challenge.runs.length}</dd></div><div><dt>Evidence</dt><dd>{run?.comparison?.evidenceComplete ? "Complete" : "Partial"}</dd></div></dl>
      </header>

      {run ? <SwarmExecution run={run} /> : null}

      {strongest ? <section className="challenge-featured" aria-labelledby="found-heading"><div className="section-bar"><div><span className="eyebrow">Strongest confirmed regression</span><h2 id="found-heading">What ALT QR found</h2></div><p>Claim and evidence stay together.</p></div><Finding finding={strongest} featured provenance={findingProvenance(run, strongest.identity)} /></section> : null}

      {run?.scans.production?.screenshot || run?.scans.candidate?.screenshot ? <section className="challenge-captures" aria-labelledby="captures-heading"><div className="section-bar"><div><span className="eyebrow">Captured browser evidence</span><h2 id="captures-heading">Production and candidate</h2></div><p>Primary-page captures from this run.</p></div><div>{run.scans.production?.screenshot ? <figure><figcaption>Production</figcaption><Image unoptimized src={run.scans.production.screenshot.url} width={run.scans.production.screenshot.width} height={run.scans.production.screenshot.height} alt="Production primary-page capture" /></figure> : null}{run.scans.candidate?.screenshot ? <figure><figcaption>Candidate</figcaption><Image unoptimized src={run.scans.candidate.screenshot.url} width={run.scans.candidate.screenshot.width} height={run.scans.candidate.screenshot.height} alt="Candidate primary-page capture" /></figure> : null}</div></section> : null}

      {run?.comparison ? <>
        <FindingSection id="new-regressions" title="New regressions" description="Candidate-only findings reproduced in a fresh verification scan." findings={run.comparison.newRegressions} run={run} />
        <FindingSection id="existing-issues" title="Existing issues" description="Present in production and candidate. These do not count as a challenge win." findings={run.comparison.existingIssues} run={run} />
        <FindingSection id="fixed-issues" title="Improvements / fixed findings" description="Present in production and absent from the candidate scan." findings={run.comparison.fixedIssues} run={run} />
        <FindingSection id="unverified-changes" title="Unverified changes" description="Observed differences that did not meet the qualifying standard." findings={run.comparison.unverifiedChanges} run={run} />
      </> : null}

      {run ? <section className="challenge-method" aria-labelledby="methodology-heading"><div><span className="eyebrow">Methodology</span><h2 id="methodology-heading">How this verdict was reached</h2></div><ol><li>Production and candidate scans established deterministic evidence and route coverage.</li><li>Six isolated roles reviewed only evidence relevant to their mission.</li><li>The Evidence Judge normalized claims, rejected baseline/environmental noise, and required fresh reproduction.</li><li>Preliminary READY proceeded to an independent Red Team route check before the final verdict.</li></ol></section> : null}
    </div>
  );
}
