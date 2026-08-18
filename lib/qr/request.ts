export class RequestBodyError extends Error {}

export async function readJsonBody(request: Request, maxBytes = 8_192, timeoutMs = 5_000): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new RequestBodyError("Request body is too large.");
  if (!request.body) throw new RequestBodyError("Request body is required.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  let rejectAbort: (error: RequestBodyError) => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const cancel = () => rejectAbort(new RequestBodyError("Request was cancelled."));
  const deadline = setTimeout(() => rejectAbort(new RequestBodyError("Request body timed out.")), timeoutMs);
  if (request.signal.aborted) cancel();
  else request.signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new RequestBodyError("Request body is too large.");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    clearTimeout(deadline);
    request.signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => undefined);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestBodyError("Request body must be valid JSON.");
  }
}
