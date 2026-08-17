"use client";

import { useEffect } from "react";

import { VerificationMark } from "@/components/qr/verification-mark";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("ALT QR route failed", error.digest ?? "no-digest"); }, [error]);
  return <main id="main-content" className="control-page route-state" role="alert"><VerificationMark state="blocked" /><h1>This release view could not be loaded.</h1><p>The stored project data may be unavailable or unreadable. Retry the read, or return to the dashboard and open another project.</p><div><button className="primary-action" type="button" onClick={reset}>Retry view</button><a className="secondary-action" href="/dashboard">Open dashboard</a></div></main>;
}
