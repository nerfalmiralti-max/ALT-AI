import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";

describe("Challenge persistence", () => {
  it("persists immutable run history and a bounded recent index", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "alt-qr-challenge-store-"));
    const storeUrl = pathToFileURL(path.resolve("lib/qr/store.ts")).href;
    const script = `
      const storeNamespace = await import(${JSON.stringify(storeUrl)});
      const store = storeNamespace.default ?? storeNamespace;
      const swarmNamespace = await import(${JSON.stringify(pathToFileURL(path.resolve("lib/qr/swarm.ts")).href)});
      const swarmModule = swarmNamespace.default ?? swarmNamespace;
      const challenge = await store.createChallenge({
        productionUrl: "https://production.example/",
        candidateUrl: "https://candidate.example/",
        qaStack: "Playwright + manual QA",
        existingQaVerdict: "PASSED",
      });
      const first = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        progress: { stage: "COMPLETE", detail: "First run complete", updatedAt: new Date().toISOString() },
        scanIds: { production: crypto.randomUUID(), candidate: crypto.randomUUID(), verification: crypto.randomUUID() },
        verdict: "ALT_QR_WON",
      };
      first.swarm = swarmModule.createSwarmRun(challenge.id, first.id);
      first.swarm.stage = "COMPLETE";
      first.swarm.preliminaryVerdict = "PRELIMINARY_READY";
      first.swarm.redTeam.status = "BLOCKER_FOUND";
      first.swarm.finalVerdict = "HOLD";
      first.swarm.readyRevoked = true;
      first.swarm.adversariallyVerified = true;
      first.swarm.events.push({ name: "verdict_revoked", at: new Date().toISOString(), detail: "Preliminary READY revoked." });
      const second = {
        id: crypto.randomUUID(),
        createdAt: new Date(Date.now() + 1000).toISOString(),
        progress: { stage: "COMPLETE", detail: "Second run complete", updatedAt: new Date(Date.now() + 1000).toISOString() },
        scanIds: { production: crypto.randomUUID(), candidate: crypto.randomUUID() },
        verdict: "NO_QUALIFYING_MISS",
      };
      second.swarm = swarmModule.createSwarmRun(challenge.id, second.id);
      second.swarm.stage = "COMPLETE";
      second.swarm.preliminaryVerdict = "PRELIMINARY_READY";
      second.swarm.redTeam.status = "CLEAR";
      second.swarm.finalVerdict = "READY";
      second.swarm.adversariallyVerified = true;
      await store.appendChallengeRun(challenge.id, first);
      await store.appendChallengeRun(challenge.id, second);
      const stored = await store.getChallenge(challenge.id);
      const recent = await store.listChallenges(1);
      process.stdout.write(JSON.stringify({ stored, recent }));
    `;
    const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      env: { ...process.env, ALT_QR_DATA_DIR: dataDir, NODE_ENV: "test" },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout) as {
      stored: { runs: { verdict: string; swarm?: { readyRevoked: boolean; finalVerdict?: string; events: { name: string }[] } }[] };
      recent: { id: string; runs: { verdict: string }[] }[];
    };
    assert.deepEqual(output.stored.runs.map((run) => run.verdict), ["ALT_QR_WON", "NO_QUALIFYING_MISS"]);
    assert.equal(output.stored.runs[0]?.swarm?.readyRevoked, true);
    assert.equal(output.stored.runs[0]?.swarm?.finalVerdict, "HOLD");
    assert.equal(output.stored.runs[0]?.swarm?.events.some((entry) => entry.name === "verdict_revoked"), true);
    assert.equal(output.stored.runs[1]?.swarm?.finalVerdict, "READY");
    assert.equal(output.recent.length, 1);
    assert.equal(output.recent[0]?.runs.length, 2);
    const index = JSON.parse(await readFile(path.join(dataDir, "challenges.json"), "utf8")) as { challenges: unknown[] };
    assert.equal(index.challenges.length, 1);
  });
});
