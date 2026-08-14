import { spawn, type ChildProcess } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";

function start(args: string[], env: NodeJS.ProcessEnv) {
  return spawn(process.execPath, args, { cwd: process.cwd(), env, stdio: "inherit", windowsHide: true });
}

async function waitFor(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function terminate(child: ChildProcess) {
  if (child.exitCode !== null || child.killed) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 2_000)),
  ]);
}

async function runTests(common: NodeJS.ProcessEnv, phase: "initial" | "persistence") {
  const tests = start(["node_modules/@playwright/test/cli.js", "test"], { ...common, ALT_QR_E2E_MANAGED: "1", ALT_QR_E2E_PHASE: phase });
  const code = await new Promise<number>((resolve, reject) => {
    tests.once("error", reject);
    tests.once("exit", (value) => resolve(value ?? 1));
  });
  if (code !== 0) throw new Error(`Playwright ${phase} phase exited with code ${code}`);
}

async function main() {
  const common = { ...process.env };
  const testData = path.resolve(process.cwd(), ".alt-qr-data", "e2e");
  const dataRoot = path.resolve(process.cwd(), ".alt-qr-data");
  if (!testData.startsWith(`${dataRoot}${path.sep}`)) throw new Error("Refusing to clear E2E data outside the ALT QR test store");
  await rm(testData, { recursive: true, force: true });
  const fixture = start(["node_modules/tsx/dist/cli.mjs", "tests/fixtures/standalone.ts"], { ...common, FIXTURE_PORT: "4173" });
  const nextEnv = { ...common, ALT_QR_DATA_DIR: ".alt-qr-data/e2e", ALT_QR_ALLOW_PRIVATE_TARGETS: "true" };
  let next = start(["node_modules/next/dist/bin/next", "dev", "-p", "3100"], nextEnv);
  try {
    await Promise.all([waitFor("http://127.0.0.1:4173/good", 30_000), waitFor("http://127.0.0.1:3100", 120_000)]);
    await runTests(common, "initial");
    await terminate(next);
    next = start(["node_modules/next/dist/bin/next", "dev", "-p", "3100"], nextEnv);
    await waitFor("http://127.0.0.1:3100", 120_000);
    await runTests(common, "persistence");
  } finally {
    await Promise.all([terminate(next), terminate(fixture)]);
  }
}

void main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
