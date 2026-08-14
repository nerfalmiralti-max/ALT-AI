import Link from "next/link";

export function BrandMark() {
  return (
    <Link className="brand-mark" href="/" aria-label="ALT Quality Radar home">
      <span>ALT</span><i aria-hidden="true">/</i><span>QR</span><small>Quality Radar</small>
    </Link>
  );
}
