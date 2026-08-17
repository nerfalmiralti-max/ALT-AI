import { notFound } from "next/navigation";

import { ComparisonWorkspace } from "@/components/qr/comparison-workspace";
import { getProject, getScan } from "@/lib/qr/store";

export const dynamic = "force-dynamic";

export default async function ComparisonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ against?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const scan = await getScan(id);
  if (!scan) notFound();
  const project = await getProject(scan.projectId);
  if (!project) notFound();
  const requested = query.against === "baseline" ? "baseline" : "previous";
  const target = scan.comparisons[requested] ? requested : scan.comparisons.previous ? "previous" : scan.comparisons.baseline ? "baseline" : requested;
  return <ComparisonWorkspace project={project} scan={scan} target={target} />;
}
