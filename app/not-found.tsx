import Link from "next/link";

import { VerificationMark } from "@/components/qr/verification-mark";

export default function NotFound() {
  return <main id="main-content" className="control-page route-state"><VerificationMark state="partial" /><h1>That ALT QR record was not found.</h1><p>The project or scan may have been removed from local storage. Open the control room to choose an available record.</p><div><Link className="primary-action" href="/dashboard">Open dashboard</Link><Link className="secondary-action" href="/scan/new">Start a new scan</Link></div></main>;
}
