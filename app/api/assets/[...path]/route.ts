import { readFile } from "node:fs/promises";

import { resolveAssetPath } from "@/lib/qr/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await params;
    const relative = path.join("/");
    if (!relative.endsWith(".png")) return new Response("Not found", { status: 404 });
    const image = await readFile(resolveAssetPath(relative));
    return new Response(image, {
      headers: {
        "content-type": "image/png",
        "cache-control": "private, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
