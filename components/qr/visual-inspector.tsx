"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import type { ScreenshotAsset } from "@/lib/qr/types";
import type { CaptureMode, ComparisonTarget, ReportPayload } from "./report-model";
import { assetUrl } from "./report-model";

function VisualCapture({ asset, label, viewport, onOpen }: { asset: ScreenshotAsset | undefined; label: string; viewport: "desktop" | "mobile"; onOpen: (asset: ScreenshotAsset, label: string) => void }) {
  return <figure><figcaption>{label}</figcaption>{asset ? <button className="visual-open" type="button" onClick={() => onOpen(asset, label)} aria-label={`Open ${label} screenshot fullscreen`}><Image src={assetUrl(asset)} alt={`${label} ${viewport} screenshot`} width={asset.width} height={asset.height} unoptimized /><span>Open fullscreen</span></button> : <p>Capture unavailable.</p>}</figure>;
}

export function VisualInspector({ payload }: { payload: ReportPayload }) {
  const { scan } = payload;
  const [target, setTarget] = useState<ComparisonTarget>(payload.baseline ? "baseline" : "previous");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [mode, setMode] = useState<CaptureMode>(payload.previous || payload.baseline ? "compare" : "current");
  const [modalAsset, setModalAsset] = useState<{ asset: ScreenshotAsset; label: string } | null>(null);
  const [zoom, setZoom] = useState(100);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const reference = target === "baseline" ? payload.baseline : payload.previous;
  const current = scan.screenshots.find((asset) => asset.viewport === viewport);
  const before = reference?.screenshots.find((asset) => asset.viewport === viewport);
  const diff = scan.screenshots.find((asset) => asset.viewport === "diff" && (asset.sourceViewport ?? "desktop") === viewport && (asset.comparisonTarget ?? "previous") === target);
  const comparison = scan.visualComparisons.find((item) => item.viewport === viewport && item.comparisonTarget === target);

  function open(asset: ScreenshotAsset | undefined, label: string) {
    if (!asset) return;
    setModalAsset({ asset, label });
    setZoom(100);
    dialogRef.current?.showModal();
  }

  return (
    <section className="visual-inspector report-section" id="visual" aria-labelledby="visual-heading">
      <div className="section-heading"><div><span>Image evidence</span><h2 id="visual-heading">Visual inspector</h2><p>Captured screenshots are fitted as images. Open fullscreen to inspect detail and zoom.</p></div>{comparison ? <div className="visual-difference"><strong>{comparison.diffPercentage}%</strong><span>{comparison.rating.toLowerCase()}</span></div> : null}</div>
      <div className="visual-toolbar">
        <div className="segmented-control" role="group" aria-label="Capture viewport"><button type="button" aria-pressed={viewport === "desktop"} onClick={() => setViewport("desktop")}>Desktop</button><button type="button" aria-pressed={viewport === "mobile"} onClick={() => setViewport("mobile")}>Mobile</button></div>
        <div className="segmented-control" role="group" aria-label="Comparison target"><button type="button" aria-pressed={target === "previous"} disabled={!payload.previous} onClick={() => setTarget("previous")}>Previous</button><button type="button" aria-pressed={target === "baseline"} disabled={!payload.baseline} onClick={() => setTarget("baseline")}>Baseline</button></div>
        <div className="segmented-control" role="group" aria-label="Capture mode"><button type="button" aria-pressed={mode === "current"} onClick={() => setMode("current")}>Current</button><button type="button" aria-pressed={mode === "compare"} disabled={!before} onClick={() => setMode("compare")}>Compare</button><button type="button" aria-pressed={mode === "diff"} disabled={!diff} onClick={() => setMode("diff")}>Diff</button></div>
      </div>
      <div className={`visual-stage visual-stage--${mode}`}>
        {mode === "compare" ? <><VisualCapture asset={before} label={`Before · ${target}`} viewport={viewport} onOpen={open} /><VisualCapture asset={current} label="After · current" viewport={viewport} onOpen={open} /></> : <VisualCapture asset={mode === "diff" ? diff : current} label={`${mode} · ${viewport}`} viewport={viewport} onOpen={open} />}
      </div>
      <div className="visual-summary"><span>{comparison?.rating ?? "No comparison"}</span><small>{comparison ? `${comparison.changedPixels.toLocaleString()} of ${comparison.totalPixels.toLocaleString()} pixels changed` : "Run a second scan or set a baseline to calculate visual change."}</small></div>

      <dialog className="visual-dialog" ref={dialogRef} aria-labelledby="visual-dialog-title" onClose={() => setModalAsset(null)}>
        <div className="visual-dialog__header"><div><span>Screenshot</span><h3 id="visual-dialog-title">{modalAsset?.label}</h3></div><div className="zoom-controls" role="group" aria-label="Screenshot zoom"><button type="button" onClick={() => setZoom((value) => Math.max(50, value - 25))} aria-label="Zoom out">−</button><output aria-live="polite">{zoom}%</output><button type="button" onClick={() => setZoom((value) => Math.min(200, value + 25))} aria-label="Zoom in">+</button><button type="button" onClick={() => dialogRef.current?.close()}>Close</button></div></div>
        <div className="visual-dialog__canvas">{modalAsset ? <Image src={assetUrl(modalAsset.asset)} alt={`${modalAsset.label} screenshot`} width={modalAsset.asset.width} height={modalAsset.asset.height} unoptimized style={{ width: `${zoom}%`, maxWidth: zoom <= 100 ? "100%" : "none", height: "auto" }} /> : null}</div>
      </dialog>
    </section>
  );
}
