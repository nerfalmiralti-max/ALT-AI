type VerificationState = "scanning" | "partial" | "verified" | "blocked" | "idle";

const LABELS: Record<VerificationState, string> = {
  scanning: "Scan in progress",
  partial: "Partial verification",
  verified: "Verified",
  blocked: "Release blocked",
  idle: "Scanner ready",
};

export function VerificationMark({ state, label = LABELS[state] }: { state: VerificationState; label?: string }) {
  return (
    <span className="verification-mark" data-state={state} role="img" aria-label={label}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle className="verification-mark__ring" cx="10" cy="10" r="7.25" />
        {state === "verified" ? <path d="m6.4 10.2 2.1 2.2 5.2-5.1" /> : null}
        {state === "blocked" ? <path d="m7 7 6 6m0-6-6 6" /> : null}
        {state === "partial" ? <path d="M10 2.75a7.25 7.25 0 0 1 0 14.5Z" /> : null}
        {state === "idle" ? <circle cx="10" cy="10" r="2.25" /> : null}
      </svg>
    </span>
  );
}
