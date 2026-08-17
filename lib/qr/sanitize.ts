export function sanitizeDiagnosticText(value: string) {
  return value
    .replace(/\s+Call log:[\s\S]*$/i, "")
    .replace(/\b[A-Za-z]:[\\/][^\r\n]*?(?::\d+){1,2}(?=\)?(?:\s|$))/g, "[local path]")
    .replace(/\b[A-Za-z]:[\\/][^\r\n]*/g, "[local path]");
}

const SENSITIVE_QUERY_KEY = /(?:^|[_-])(?:access|api|auth|bearer|credential|jwt|key|password|secret|session|signature|signed|token)(?:$|[_-])/i;

export function redactSensitiveUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY.test(key)) url.searchParams.set(key, "[redacted]");
    }
    return url.toString();
  } catch {
    return sanitizeDiagnosticText(value).slice(0, 2_048);
  }
}
