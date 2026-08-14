import type { LighthouseMetrics, MetricRating, PerformanceReading } from "./types";

type MetricSpec = Omit<PerformanceReading, "value" | "rating">;

export const PERFORMANCE_THRESHOLDS: Record<PerformanceReading["key"], MetricSpec> = {
  lcp: { key: "lcp", label: "Largest Contentful Paint", unit: "ms", goodThreshold: 2_500, poorThreshold: 4_000 },
  cls: { key: "cls", label: "Cumulative Layout Shift", unit: "ratio", goodThreshold: 0.1, poorThreshold: 0.25 },
  tbt: { key: "tbt", label: "Total Blocking Time", unit: "ms", goodThreshold: 200, poorThreshold: 600 },
  fcp: { key: "fcp", label: "First Contentful Paint", unit: "ms", goodThreshold: 1_800, poorThreshold: 3_000 },
  speedIndex: { key: "speedIndex", label: "Speed Index", unit: "ms", goodThreshold: 3_400, poorThreshold: 5_800 },
};

export function ratePerformanceMetric(key: PerformanceReading["key"], value: number): MetricRating {
  const thresholds = PERFORMANCE_THRESHOLDS[key];
  if (value <= thresholds.goodThreshold) return "GOOD";
  if (value <= thresholds.poorThreshold) return "NEEDS ATTENTION";
  return "POOR";
}

export function buildPerformanceReadings(lighthouse: LighthouseMetrics): PerformanceReading[] {
  const metrics = lighthouse.metrics ?? {};
  return (Object.keys(PERFORMANCE_THRESHOLDS) as PerformanceReading["key"][]).flatMap((key) => {
    const value = metrics[key];
    if (typeof value !== "number") return [];
    return [{ ...PERFORMANCE_THRESHOLDS[key], value, rating: ratePerformanceMetric(key, value) }];
  });
}
