import { NextResponse } from "next/server";

import { buildReleaseReceipt } from "@/lib/qr/receipt";
import { getProject, getScan } from "@/lib/qr/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await getScan(id);
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  const project = await getProject(scan.projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const receipt = buildReleaseReceipt(scan, project);
  return new NextResponse(`${JSON.stringify(receipt, null, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="alt-qr-${scan.id.slice(0, 8)}-release-receipt.json"`,
      "cache-control": "no-store",
    },
  });
}
