import { startFixtureServer } from "./server";

async function main() {
  const production = await startFixtureServer(Number(process.env.FIXTURE_PORT || 4173), "A");
  const candidate = await startFixtureServer(Number(process.env.CANDIDATE_FIXTURE_PORT || 4174), "B");
  console.log(`ALT QR fixtures listening on ${production.origin} and ${candidate.origin}`);
  const stop = async () => { await Promise.all([production.close(), candidate.close()]); process.exit(0); };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

void main().catch((error) => { console.error(error); process.exit(1); });
