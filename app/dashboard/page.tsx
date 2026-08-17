import { Dashboard } from "@/components/qr/dashboard";
import { getScan, listChallenges, listProjects } from "@/lib/qr/store";
import type { ScanRecord } from "@/lib/qr/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [projects, challenges] = await Promise.all([listProjects(), listChallenges(6)]);
  const scans = (await Promise.all(projects.map((project) => project.latestScanId ? getScan(project.latestScanId) : null))).filter((scan): scan is ScanRecord => Boolean(scan));
  return <Dashboard projects={projects} scans={scans} challenges={challenges} />;
}
