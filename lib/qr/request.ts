export class RequestBodyError extends Error {}

export async function readJsonBody(request: Request, maxBytes = 8_192): Promise<unknown> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new RequestBodyError("Request body is too large.");
  if (!request.body) throw new RequestBodyError("Request body is required.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
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
