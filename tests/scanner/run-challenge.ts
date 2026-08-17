import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { startFixtureServer } from "../fixtures/server";

async function main() {
  process.env.ALT_QR_DATA_DIR = await mkdtemp(path.join(tmpdir(), "alt-qr-challenge-scan-"));
  process.env.ALT_QR_ALLOW_PRIVATE_TARGETS = "true";
  process.env.ALT_QR_CHALLENGE_MAX_PAGES = "1";
  process.env.ALT_QR_SCAN_TIMEOUT_MS = "60000";
  process.env.ALT_QR_CHALLENGE_TIMEOUT_MS = "480000";
  process.env.ALT_QR_RED_TEAM_MAX_TARGETS = "1";
  const productionFixture = await startFixtureServer(0, "A");
  const candidateFixture = await startFixtureServer(0, "C");

  try {
    const [{ createChallenge, getChallenge }, { enqueueChallengeRun, startChallenge }, { presentChallenge }] = await Promise.all([
      import("../../lib/qr/store"),
      import("../../lib/qr/challenge-worker"),
      import("../../lib/qr/challenge-presentation"),
    ]);

    // Scenario A: primary READY, Red Team reaches an uncovered route, reproduces
    // a candidate-only exception, and revokes READY.
    const challenge = await createChallenge({
      productionUrl: `${productionFixture.origin}/`,
      candidateUrl: `${candidateFixture.origin}/`,
      existingQaVerdict: "PASSED",
      qaStack: "Fixture QA",
    });
    const first = await enqueueChallengeRun(challenge.id);
    await startChallenge(challenge.id, first.id);
    let stored = await getChallenge(challenge.id);
    const firstRun = stored?.runs[0];
    assert.equal(firstRun?.swarm?.preliminaryVerdict, "PRELIMINARY_READY");
    assert.equal(firstRun?.swarm?.redTeam.status, "BLOCKER_FOUND");
    assert.equal(firstRun?.swarm?.finalVerdict, "HOLD");
    assert.equal(firstRun?.swarm?.readyRevoked, true);
    assert.equal(firstRun?.swarm?.adversariallyVerified, true);
    assert.equal(firstRun?.verdict, "ALT_QR_WON");
    assert.equal(firstRun?.comparison?.qualifyingRegressionCount, 1);
    assert.equal(firstRun?.comparison?.newRegressions[0]?.route, "/good");
    assert.deepEqual(firstRun?.comparison?.newRegressions[0]?.reproduction, { observed: 2, attempts: 2 });
    assert.ok(firstRun?.swarm?.events.some((entry) => entry.name === "verdict_revoked"));
    assert.equal(firstRun?.swarm?.redTeam.decisions.some((entry) => entry.disposition === "CONFIRMED" && entry.releaseBlocker), true);

    const clientJson = JSON.stringify(await presentChallenge(stored!));
    assert.doesNotMatch(clientJson, /cookie|authorization|call log:|[a-z]:\\users\\/i);
    assert.doesNotMatch(clientJson, /ignore previous instructions/i);

    // Scenario B: the fixed release survives both primary and adversarial passes.
    candidateFixture.setVariant("A");
    const second = await enqueueChallengeRun(challenge.id);
    await startChallenge(challenge.id, second.id);
    stored = await getChallenge(challenge.id);
    const secondRun = stored?.runs[1];
    assert.equal(stored?.runs.length, 2);
    assert.equal(stored?.runs[0]?.swarm?.readyRevoked, true);
    assert.equal(secondRun?.swarm?.preliminaryVerdict, "PRELIMINARY_READY");
    assert.equal(secondRun?.swarm?.redTeam.status, "CLEAR");
    assert.equal(secondRun?.swarm?.finalVerdict, "READY");
    assert.equal(secondRun?.swarm?.adversariallyVerified, true);
    assert.equal(secondRun?.verdict, "NO_QUALIFYING_MISS");

    // Scenario C: a normal primary Runtime finding holds the release, so an
    // additional expensive Red Team pass is not needed.
    candidateFixture.setVariant("B");
    const primaryBlocker = await createChallenge({
      productionUrl: `${productionFixture.origin}/`,
      candidateUrl: `${candidateFixture.origin}/`,
      existingQaVerdict: "UNKNOWN",
    });
    const primaryRun = await enqueueChallengeRun(primaryBlocker.id);
    await startChallenge(primaryBlocker.id, primaryRun.id);
    const primaryStored = await getChallenge(primaryBlocker.id);
    assert.equal(primaryStored?.runs[0]?.swarm?.preliminaryVerdict, "PRELIMINARY_HOLD");
    assert.equal(primaryStored?.runs[0]?.swarm?.redTeam.status, "SKIPPED_HOLD");
    assert.equal(primaryStored?.runs[0]?.swarm?.finalVerdict, "HOLD");
    assert.equal(primaryStored?.runs[0]?.verdict, "RELEASE_HAS_REGRESSIONS");
    assert.ok((primaryStored?.runs[0]?.swarm?.judgeDecisions.filter((entry) => entry.disposition === "DUPLICATE").length ?? 0) >= 1);

    // Scenario D: the same root exception in production and candidate is a
    // baseline issue, not a candidate regression or challenge win.
    productionFixture.setVariant("B");
    const baselineIssue = await createChallenge({
      productionUrl: `${productionFixture.origin}/`,
      candidateUrl: `${candidateFixture.origin}/`,
      existingQaVerdict: "PASSED",
    });
    const baselineRun = await enqueueChallengeRun(baselineIssue.id);
    await startChallenge(baselineIssue.id, baselineRun.id);
    const baselineStored = await getChallenge(baselineIssue.id);
    assert.equal(baselineStored?.runs[0]?.swarm?.judgeDecisions.some((entry) => entry.disposition === "BASELINE_ISSUE"), true);
    assert.equal(baselineStored?.runs[0]?.comparison?.qualifyingRegressionCount, 0);
    assert.equal(baselineStored?.runs[0]?.verdict, "NO_QUALIFYING_MISS");

    // Critical scan failure remains explicitly inconclusive.
    productionFixture.setVariant("A");
    const incomplete = await createChallenge({
      productionUrl: `${productionFixture.origin}/`,
      candidateUrl: `${candidateFixture.origin}/partial-failure`,
      existingQaVerdict: "PASSED",
    });
    const incompleteRun = await enqueueChallengeRun(incomplete.id);
    await startChallenge(incomplete.id, incompleteRun.id);
    const incompleteStored = await getChallenge(incomplete.id);
    assert.equal(incompleteStored?.runs[0]?.verdict, "INSUFFICIENT_EVIDENCE");
    assert.equal(incompleteStored?.runs[0]?.swarm?.finalVerdict, "INCOMPLETE");

    console.log("Adversarial Challenge proof: READY revoked by Red Team, adversarial READY, primary HOLD, baseline rejection, immutable rerun history, and incomplete evidence passed.");
  } finally {
    await Promise.all([productionFixture.close(), candidateFixture.close()]);
  }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
