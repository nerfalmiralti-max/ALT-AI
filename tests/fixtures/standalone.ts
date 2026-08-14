import { startFixtureServer } from "./server";

async function main() {
  const fixture = await startFixtureServer(Number(process.env.FIXTURE_PORT || 4173));
  console.log(`ALT QR fixture listening on ${fixture.origin}`);
  const stop = async () => { await fixture.close(); process.exit(0); };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

void main().catch((error) => { console.error(error); process.exit(1); });
