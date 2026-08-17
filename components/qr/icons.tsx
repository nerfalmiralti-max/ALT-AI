import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export function DashboardIcon(props: IconProps) {
  return <Icon {...props}><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="12" y="3" width="5" height="5" rx="1" /><rect x="3" y="12" width="5" height="5" rx="1" /><rect x="12" y="12" width="5" height="5" rx="1" /></Icon>;
}

export function ScanIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 7V4h3M13 4h3v3M16 13v3h-3M7 16H4v-3" /><path d="M6.5 10h7" /></Icon>;
}

export function ProjectsIcon(props: IconProps) {
  return <Icon {...props}><path d="M3 5.5h5l1.5 2H17v8.5H3z" /><path d="M3 8h14" /></Icon>;
}

export function ArrowIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 10h12M11 5l5 5-5 5" /></Icon>;
}

export function SettingsIcon(props: IconProps) {
  return <Icon {...props}><circle cx="10" cy="10" r="3" /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" /></Icon>;
}

export function CompareIcon(props: IconProps) {
  return <Icon {...props}><path d="M4 6h10M11 3l3 3-3 3M16 14H6M9 11l-3 3 3 3" /></Icon>;
}

export function ChallengeIcon(props: IconProps) {
  return <Icon {...props}><path d="M3 10h5M12 10h5" /><path d="M8 6l4 4-4 4" /><circle cx="3" cy="10" r="1.5" /><circle cx="17" cy="10" r="1.5" /></Icon>;
}
