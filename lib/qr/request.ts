export class RequestBodyError extends Error {}

export async function readJsonBody(request: Request, maxBytes = 8_192, timeoutMs = 5_000): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new RequestBodyError("Request body is too large.");
  if (!request.body) throw new RequestBodyError("Request body is required.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([request.signal, deadline]);
  const aborted = new Promise<never>((_resolve, reject) => {
    const stop = () => reject(new RequestBodyError(deadline.aborted ? "Request body timed out." : "Request was cancelled."));
    if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true });
  });
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
    await reader.cancel().catch(() => undefined);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestBodyError("Request body must be valid JSON.");
  }
}
