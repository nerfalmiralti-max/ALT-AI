export type StorageUsage = { scanCount: number; storedBytes: number };
export type StorageQuota = { maxStoredScans: number; maxStoredBytes: number; reservationBytes: number };

export function storageCapacityReason(usage: StorageUsage, quota: StorageQuota) {
  if (usage.scanCount >= quota.maxStoredScans) {
    return `The local scan-count limit of ${quota.maxStoredScans} has been reached.`;
  }
  if (usage.storedBytes + quota.reservationBytes > quota.maxStoredBytes) {
    return "The local evidence storage limit does not have enough reserved capacity for another scan.";
  }
  return null;
}
