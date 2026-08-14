import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "ALT QR — Release Quality Radar",
  description: "Deterministic browser-based release intelligence with evidence, comparisons, gates, and visual change.",
};

export const viewport: Viewport = {
  themeColor: "#080a0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
