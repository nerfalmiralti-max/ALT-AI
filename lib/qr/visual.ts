import type { VisualChangeRating } from "./types";

export const VISUAL_CHANGE_THRESHOLDS = Object.freeze({
  noMeaningfulChangeMax: 0.1,
  minorChangeMax: 1,
  visibleChangeMax: 5,
});

export function classifyVisualChange(percentage: number): VisualChangeRating {
  if (percentage <= VISUAL_CHANGE_THRESHOLDS.noMeaningfulChangeMax) return "NO MEANINGFUL CHANGE";
  if (percentage <= VISUAL_CHANGE_THRESHOLDS.minorChangeMax) return "MINOR CHANGE";
  if (percentage <= VISUAL_CHANGE_THRESHOLDS.visibleChangeMax) return "VISIBLE CHANGE";
  return "MAJOR CHANGE";
}
