import { VerificationMark } from "@/components/qr/verification-mark";

export default function Loading() {
  return <main id="main-content" className="control-page route-state" aria-live="polite"><VerificationMark state="scanning" /><h1>Loading release data…</h1><p>Reading the current ALT QR project and scan records.</p></main>;
}
