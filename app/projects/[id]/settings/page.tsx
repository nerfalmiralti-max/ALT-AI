import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectSettings } from "@/components/qr/project-settings";
import { getProject } from "@/lib/qr/store";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  return <main id="main-content" className="control-page settings-page"><nav className="breadcrumb" aria-label="Breadcrumb"><Link href="/dashboard">Dashboard</Link><span>/</span><Link href={`/projects/${project.id}`}>{project.name}</Link><span>/</span><span aria-current="page">Settings</span></nav><header className="page-heading"><div><span className="eyebrow">Project settings</span><h1>Release gate</h1><p>These are the only project gate controls currently evaluated by ALT QR. Changes are saved against real project data.</p></div></header><ProjectSettings project={project} /></main>;
}
