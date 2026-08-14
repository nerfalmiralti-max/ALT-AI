import { ScanReport } from "@/components/qr/scan-report";

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ScanReport scanId={id} />;
}
