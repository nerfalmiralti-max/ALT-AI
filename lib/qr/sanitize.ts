export function sanitizeDiagnosticText(value: string) {
  return value
    .replace(/\s+Call log:[\s\S]*$/i, "")
    .replace(/\b[A-Za-z]:[\\/][^\r\n]*?(?::\d+){1,2}(?=\)?(?:\s|$))/g, "[local path]")
    .replace(/\b[A-Za-z]:[\\/][^\r\n]*/g, "[local path]");
}
