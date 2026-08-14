"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { normalizeTargetInput } from "@/lib/qr/url";

type ScanFormProps = {
  compact?: boolean;
  initialUrl?: string;
  recentUrls?: string[];
  buttonOnly?: boolean;
};

export function ScanForm({ compact = false, initialUrl = "", recentUrls = [], buttonOnly = false }: ScanFormProps) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const preparedUrl = normalizeTargetInput(url);
    if (!preparedUrl) {
      setError("Enter a website URL to start a scan.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: preparedUrl }),
      });
      const body = (await response.json()) as { scanId?: string; error?: string };
      if (!response.ok || !body.scanId) throw new Error(body.error || "The scan could not be started.");
      router.push(`/scan/${body.scanId}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The scan could not be started.");
      setSubmitting(false);
    }
  }

  if (buttonOnly) {
    return (
      <form className="quick-rescan" onSubmit={submit} noValidate>
        <button type="submit" disabled={submitting}>{submitting ? "Starting scan…" : "Rescan"}</button>
        {error ? <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p> : null}
      </form>
    );
  }

  const prefix = compact ? "rescan" : "scan";
  return (
    <form className={compact ? "scan-form scan-form--compact" : "scan-form"} onSubmit={submit} noValidate>
      <label htmlFor={`${prefix}-url`}>Website URL</label>
      <div className="scan-form__line">
        <input
          id={`${prefix}-url`}
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          placeholder="example.com…"
          value={url}
          list={recentUrls.length ? `${prefix}-recent-urls` : undefined}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error) setError("");
          }}
          required
          aria-describedby={error ? `${prefix}-error` : `${prefix}-hint`}
        />
        <button type="submit" disabled={submitting}>{submitting ? "Starting scan…" : compact ? "Rescan" : "Scan website"}</button>
      </div>
      <p className="field-hint" id={`${prefix}-hint`}>Public HTTP or HTTPS website. Up to 10 same-origin pages.</p>
      {recentUrls.length ? <datalist id={`${prefix}-recent-urls`}>{recentUrls.map((item) => <option value={item} key={item} />)}</datalist> : null}
      {error ? <p className="form-error" id={`${prefix}-error`} role="alert" tabIndex={-1} ref={errorRef}>{error}</p> : null}
    </form>
  );
}
