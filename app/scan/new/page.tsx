import { NewScan } from "@/components/qr/new-scan";
import { recentScans } from "@/lib/qr/store";

export const dynamic = "force-dynamic";

export default async function NewScanPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const [scans, query] = await Promise.all([recentScans(24), searchParams]);
  return <NewScan scans={scans} initialUrl={query.url ?? ""} />;
}
