import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import { scannerConfig } from "./config";

export type ImageDiff = { png: Buffer; changedPixels: number; totalPixels: number; diffPercentage: number; width: number; height: number };

function pngDimensions(buffer: Buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature || buffer.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error("Screenshot is not a valid PNG image.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function copyInto(source: PNG, width: number, height: number) {
  const target = new PNG({ width, height, fill: true });
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const from = (y * source.width + x) * 4;
      const to = (y * width + x) * 4;
      source.data.copy(target.data, to, from, from + 4);
    }
  }
  return target;
}

export function comparePngBuffers(baselineBuffer: Buffer, currentBuffer: Buffer): ImageDiff {
  const maxEncodedBytes = Math.max(1_000_000, scannerConfig.maxScreenshotPixels * 4);
  if (baselineBuffer.length > maxEncodedBytes || currentBuffer.length > maxEncodedBytes) throw new Error("Screenshot exceeds the visual-comparison byte budget.");
  const declared = [pngDimensions(baselineBuffer), pngDimensions(currentBuffer)];
  if (declared.some(({ width, height }) => width <= 0 || height <= 0 || width * height > scannerConfig.maxScreenshotPixels)) throw new Error("Screenshot exceeds the visual-comparison pixel budget.");
  const baselineRaw = PNG.sync.read(baselineBuffer);
  const currentRaw = PNG.sync.read(currentBuffer);
  const width = Math.max(baselineRaw.width, currentRaw.width);
  const height = Math.max(baselineRaw.height, currentRaw.height);
  if (width * height > scannerConfig.maxScreenshotPixels) throw new Error("Screenshot exceeds the visual-comparison pixel budget.");
  const baseline = copyInto(baselineRaw, width, height);
  const current = copyInto(currentRaw, width, height);
  const diff = new PNG({ width, height });
  const changedPixels = pixelmatch(baseline.data, current.data, diff.data, width, height, { threshold: 0.1, includeAA: false });
  const totalPixels = width * height;
  return {
    png: PNG.sync.write(diff),
    changedPixels,
    totalPixels,
    diffPercentage: Number(((changedPixels / totalPixels) * 100).toFixed(3)),
    width,
    height,
  };
}
