"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { BrandMark } from "./brand-mark";
import { ChallengeIcon, DashboardIcon, ProjectsIcon, ScanIcon } from "./icons";

const NAVIGATION = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/scan/new", label: "New scan", icon: ScanIcon },
  { href: "/challenge", label: "Challenge", icon: ChallengeIcon },
] as const;

export function ProductShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const inProject = pathname.startsWith("/projects/") || (pathname.startsWith("/scan/") && pathname !== "/scan/new");
  return (
    <div className="product-frame">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="product-header">
        <BrandMark />
        <nav className="product-nav" aria-label="Product navigation">
          {NAVIGATION.map(({ href, label, icon: NavIcon }) => {
            const current = pathname === href || (href === "/challenge" && pathname.startsWith("/challenge/"));
            const activeSection = current || (href === "/dashboard" && inProject);
            return <Link key={href} href={href} aria-current={current ? "page" : undefined} data-active={activeSection ? "true" : undefined}><NavIcon /><span>{label}</span></Link>;
          })}
          {inProject ? <span className="product-nav__context"><ProjectsIcon /><span>Project workspace</span></span> : null}
        </nav>
        <Link className="product-header__action" href="/scan/new"><ScanIcon />Start scan</Link>
      </header>
      <div className="product-content">{children}</div>
      <footer className="product-footer"><span>ALT Quality Radar</span><span>Evidence-led release control</span></footer>
    </div>
  );
}
