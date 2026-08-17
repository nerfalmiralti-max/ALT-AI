"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import type { ProjectRecord, ReleaseGateConfig } from "@/lib/qr/types";
import { ArrowIcon } from "./icons";

export function ProjectSettings({ project }: { project: ProjectRecord }) {
  const [config, setConfig] = useState<ReleaseGateConfig>(project.gateConfig);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...config, ...(project.latestScanId ? { scanId: project.latestScanId } : {}) }) });
      const body = await response.json() as { project?: ProjectRecord; error?: string; syncWarning?: string };
      if (!response.ok || !body.project) throw new Error(body.error || "Release gate could not be updated.");
      setConfig(body.project.gateConfig);
      setMessage(body.syncWarning ?? "Release gate updated. The latest completed report was re-evaluated when available.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Release gate could not be updated."); }
    finally { setSaving(false); }
  }

  return <form className="settings-form" onSubmit={submit}>
    <fieldset><legend>Score threshold</legend><label htmlFor="minimum-score"><span>Minimum quality score</span><small>The overall score required for the project gate to pass.</small></label><input id="minimum-score" name="minimumScore" autoComplete="off" type="number" min="0" max="100" value={config.minimumScore} onChange={(event) => setConfig({ ...config, minimumScore: Number(event.target.value) })} /></fieldset>
    <fieldset><legend>Failure limits</legend><div className="settings-field"><label htmlFor="broken-pages"><span>Maximum broken pages</span><small>How many failed page inspections the gate permits.</small></label><input id="broken-pages" name="maximumBrokenPages" autoComplete="off" type="number" min="0" max="25" value={config.maximumBrokenPages} onChange={(event) => setConfig({ ...config, maximumBrokenPages: Number(event.target.value) })} /></div><div className="settings-field"><label htmlFor="broken-links"><span>Maximum broken links</span><small>How many measured broken-link findings the gate permits.</small></label><input id="broken-links" name="maximumBrokenLinks" autoComplete="off" type="number" min="0" max="100" value={config.maximumBrokenLinks} onChange={(event) => setConfig({ ...config, maximumBrokenLinks: Number(event.target.value) })} /></div></fieldset>
    <fieldset><legend>Critical findings</legend><label className="settings-toggle"><span><b>Fail on active critical findings</b><small>Block release when the latest scan contains an active critical finding.</small></span><input name="failOnCritical" type="checkbox" checked={config.failOnCritical} onChange={(event) => setConfig({ ...config, failOnCritical: event.target.checked })} /></label></fieldset>
    <div className="settings-actions"><button className="primary-action" type="submit" disabled={saving}>{saving ? "Saving…" : "Save release gate"}</button><Link className="secondary-action" href={`/projects/${project.id}`}>Return to project<ArrowIcon /></Link></div>
    {message ? <p className="settings-message" role="status">{message}</p> : null}{error ? <p className="settings-error" role="alert">{error}</p> : null}
  </form>;
}
