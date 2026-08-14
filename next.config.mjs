/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // ALT QR serves its own validated local PNG evidence. Keep Next's image
  // optimizer out of the attack and disk-cache surface entirely.
  images: { unoptimized: true },
  serverExternalPackages: [
    "playwright",
    "@axe-core/playwright",
    "lighthouse",
    "chrome-launcher",
    "pixelmatch",
    "pngjs",
  ],
  async headers() {
    const scriptPolicy = process.env.NODE_ENV === "production" ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline' 'unsafe-eval'";
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src ${scriptPolicy}; style-src 'self' 'unsafe-inline'; form-action 'self'` },
        { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }];
  },
};

export default nextConfig;
