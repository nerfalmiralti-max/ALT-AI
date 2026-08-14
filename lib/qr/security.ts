import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

import { scannerConfig } from "./config";

export class TargetUrlError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "TargetUrlError";
  }
}

export function isPrivateAddress(value: string) {
  try {
    const address = ipaddr.parse(value);
    if (address.kind() === "ipv6") {
      const ipv6 = address as ipaddr.IPv6;
      if (ipv6.isIPv4MappedAddress()) return isPrivateAddress(ipv6.toIPv4Address().toString());
    }
    const range = address.range();
    return !["unicast"].includes(range);
  } catch {
    return true;
  }
}

const BLOCKED_DOWNLOAD_EXTENSIONS = /\.(?:apk|appx|bat|bin|cab|cmd|com|deb|dmg|exe|img|iso|jar|msi|msix|pkg|ps1|rar|rpm|scr|tar|tgz|vbs|xz|zip|7z)$/i;

export function isLikelyMaliciousDownload(raw: string) {
  try {
    return BLOCKED_DOWNLOAD_EXTENSIONS.test(new URL(raw).pathname);
  } catch {
    return true;
  }
}

export async function resolveSafeTarget(raw: string, options?: { allowPrivate?: boolean }) {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new TargetUrlError("INVALID_URL", "Enter a complete http:// or https:// URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TargetUrlError("UNSUPPORTED_SCHEME", "Only HTTP and HTTPS targets can be scanned.");
  }
  if (url.username || url.password) {
    throw new TargetUrlError("CREDENTIALS_NOT_ALLOWED", "URLs containing credentials are not accepted.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const localName = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local");
  const allowPrivate = options?.allowPrivate ?? scannerConfig.allowPrivateTargets;
  if (localName && !allowPrivate) {
    throw new TargetUrlError("PRIVATE_TARGET", "Private and loopback targets are disabled in production.");
  }
  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new TargetUrlError("DNS_FAILED", "The target hostname could not be resolved.");
  }
  if (!addresses.length) throw new TargetUrlError("DNS_FAILED", "The target hostname returned no addresses.");
  if (!allowPrivate && addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new TargetUrlError("PRIVATE_TARGET", "Private, loopback, and link-local targets are not allowed.");
  }
  return { url, addresses };
}

export async function assertSafeTarget(raw: string, options?: { allowPrivate?: boolean }) {
  return (await resolveSafeTarget(raw, options)).url;
}

export async function guardBrowserRequest(raw: string) {
  if (raw.length > scannerConfig.maxResourceUrlChars) {
    throw new TargetUrlError("RESOURCE_URL_TOO_LARGE", "The browser resource URL exceeds the configured safety limit.");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new TargetUrlError("INVALID_RESOURCE", "The browser requested an invalid resource URL.");
  }
  if (!["http:", "https:", "data:", "blob:", "about:"].includes(url.protocol)) {
    throw new TargetUrlError("UNSUPPORTED_RESOURCE", `Blocked browser resource scheme: ${url.protocol}`);
  }
  if ((url.protocol === "http:" || url.protocol === "https:") && isLikelyMaliciousDownload(url.toString())) {
    throw new TargetUrlError("DOWNLOAD_BLOCKED", "Executable and archive downloads are not inspected by ALT QR.");
  }
  if (url.protocol === "http:" || url.protocol === "https:") await assertSafeTarget(url.toString());
}
