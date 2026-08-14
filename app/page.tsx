import { Home } from "@/components/qr/home";
import { listProjects, recentScans } from "@/lib/qr/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [scans, projects] = await Promise.all([recentScans(24), listProjects()]);
  return <Home scans={scans} projects={projects} />;
}
