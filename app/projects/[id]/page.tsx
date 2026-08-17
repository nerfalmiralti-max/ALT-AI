import { notFound } from "next/navigation";

import { ProjectOverview } from "@/components/qr/project-overview";
import { getProject, getScan } from "@/lib/qr/store";
import type { ScanRecord } from "@/lib/qr/types";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const scans = (await Promise.all(project.scanIds.slice(0, 50).map(getScan))).filter((scan): scan is ScanRecord => Boolean(scan));
  return <ProjectOverview project={project} scans={scans} />;
}
