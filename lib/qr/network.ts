import type { ConsoleEvent, NetworkFailure } from "./types";

function requestKey(failure: NetworkFailure) {
  return `${failure.method}|${failure.url}|${failure.resourceType}`;
}

export function coalesceNetworkFailures(failures: NetworkFailure[]) {
  const completedFailureKeys = new Set(failures
    .filter((failure) => typeof failure.status === "number")
    .map(requestKey));
  return failures.filter((failure) => !(failure.reason === "net::ERR_ABORTED" && completedFailureKeys.has(requestKey(failure))));
}

export function filterStructuredNetworkConsoleDuplicates(events: ConsoleEvent[], failures: NetworkFailure[]) {
  const failedUrls = new Set(failures.map((failure) => failure.url));
  return events.filter((event) => !(event.level === "error"
    && /^Failed to load resource:/i.test(event.message)
    && Boolean(event.url)
    && failedUrls.has(event.url!)));
}
