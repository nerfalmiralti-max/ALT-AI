-- ALT Quality Radar: additive persistence for deterministic website scans.
-- Historical ALT AI tables are intentionally left intact.

create extension if not exists pgcrypto;

create table if not exists public.alt_qr_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  name text not null,
  origin text not null,
  latest_scan_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, origin)
);

create table if not exists public.alt_qr_scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.alt_qr_projects(id) on delete cascade,
  target_url text not null,
  normalized_url text not null,
  stage text not null check (stage in ('QUEUED','DISCOVERING','INSPECTING','AUDITING','CAPTURING','COMPARING','SCORING','COMPLETE','FAILED')),
  score smallint check (score between 0 and 100),
  score_status text check (score_status is null or score_status in ('READY','ALMOST READY','NEEDS WORK','NOT READY')),
  scanner_version text not null,
  progress jsonb not null default '{}'::jsonb,
  stage_history jsonb not null default '[]'::jsonb,
  lighthouse jsonb not null default '{}'::jsonb,
  failure jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.alt_qr_projects
  add constraint alt_qr_projects_latest_scan_id_fkey
  foreign key (latest_scan_id) references public.alt_qr_scans(id) on delete set null;

create table if not exists public.alt_qr_pages (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.alt_qr_scans(id) on delete cascade,
  url text not null,
  http_status smallint not null check (http_status between 0 and 599),
  content_type text not null default '',
  duration_ms integer not null check (duration_ms >= 0),
  headers jsonb not null default '{}'::jsonb,
  facts jsonb not null default '{}'::jsonb,
  console_errors jsonb not null default '[]'::jsonb,
  page_errors jsonb not null default '[]'::jsonb,
  request_failures jsonb not null default '[]'::jsonb,
  axe_violations jsonb not null default '[]'::jsonb,
  unique (scan_id, url)
);

create table if not exists public.alt_qr_issues (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.alt_qr_scans(id) on delete cascade,
  page_id uuid references public.alt_qr_pages(id) on delete set null,
  rule_id text not null,
  category text not null check (category in ('performance','accessibility','seo','mobile','links','browser','infrastructure')),
  severity text not null check (severity in ('CRITICAL','WARNING','NOTICE','PASS')),
  title text not null,
  description text not null,
  recommendation text not null,
  score_impact smallint not null check (score_impact between 0 and 100),
  evidence jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  unique (scan_id, fingerprint)
);

create table if not exists public.alt_qr_scan_metrics (
  id bigint generated always as identity primary key,
  scan_id uuid not null references public.alt_qr_scans(id) on delete cascade,
  metric_key text not null,
  numeric_value double precision,
  text_value text,
  unit text,
  unique (scan_id, metric_key)
);

create table if not exists public.alt_qr_screenshots (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.alt_qr_scans(id) on delete cascade,
  page_id uuid not null references public.alt_qr_pages(id) on delete cascade,
  viewport text not null check (viewport in ('desktop','mobile','diff')),
  storage_path text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  unique (scan_id, storage_path)
);

create table if not exists public.alt_qr_visual_comparisons (
  id uuid primary key default gen_random_uuid(),
  baseline_scan_id uuid not null references public.alt_qr_scans(id) on delete cascade,
  current_scan_id uuid not null references public.alt_qr_scans(id) on delete cascade,
  baseline_screenshot_id uuid not null references public.alt_qr_screenshots(id) on delete cascade,
  current_screenshot_id uuid not null references public.alt_qr_screenshots(id) on delete cascade,
  diff_screenshot_id uuid not null references public.alt_qr_screenshots(id) on delete cascade,
  changed_pixels bigint not null check (changed_pixels >= 0),
  total_pixels bigint not null check (total_pixels > 0),
  diff_percentage numeric(8,3) not null check (diff_percentage between 0 and 100),
  created_at timestamptz not null default now(),
  unique (baseline_scan_id, current_scan_id)
);

create index if not exists alt_qr_scans_project_id_idx on public.alt_qr_scans(project_id);
create index if not exists alt_qr_projects_latest_scan_id_idx on public.alt_qr_projects(latest_scan_id);
create index if not exists alt_qr_scans_created_at_idx on public.alt_qr_scans(created_at desc);
create index if not exists alt_qr_pages_scan_id_idx on public.alt_qr_pages(scan_id);
create index if not exists alt_qr_issues_scan_id_idx on public.alt_qr_issues(scan_id);
create index if not exists alt_qr_issues_page_id_idx on public.alt_qr_issues(page_id);
create index if not exists alt_qr_issues_category_severity_idx on public.alt_qr_issues(scan_id, category, severity);
create index if not exists alt_qr_scan_metrics_scan_id_idx on public.alt_qr_scan_metrics(scan_id);
create index if not exists alt_qr_screenshots_scan_id_idx on public.alt_qr_screenshots(scan_id);
create index if not exists alt_qr_screenshots_page_id_idx on public.alt_qr_screenshots(page_id);
create index if not exists alt_qr_visual_comparisons_baseline_idx on public.alt_qr_visual_comparisons(baseline_scan_id);
create index if not exists alt_qr_visual_comparisons_current_idx on public.alt_qr_visual_comparisons(current_scan_id);
create index if not exists alt_qr_visual_comparisons_baseline_shot_idx on public.alt_qr_visual_comparisons(baseline_screenshot_id);
create index if not exists alt_qr_visual_comparisons_current_shot_idx on public.alt_qr_visual_comparisons(current_screenshot_id);
create index if not exists alt_qr_visual_comparisons_diff_shot_idx on public.alt_qr_visual_comparisons(diff_screenshot_id);

alter table public.alt_qr_projects enable row level security;
alter table public.alt_qr_scans enable row level security;
alter table public.alt_qr_pages enable row level security;
alter table public.alt_qr_issues enable row level security;
alter table public.alt_qr_scan_metrics enable row level security;
alter table public.alt_qr_screenshots enable row level security;
alter table public.alt_qr_visual_comparisons enable row level security;

revoke all on public.alt_qr_projects, public.alt_qr_scans, public.alt_qr_pages,
  public.alt_qr_issues, public.alt_qr_scan_metrics, public.alt_qr_screenshots,
  public.alt_qr_visual_comparisons from anon, authenticated;

grant select, insert, update on public.alt_qr_projects, public.alt_qr_scans,
  public.alt_qr_pages, public.alt_qr_issues, public.alt_qr_scan_metrics,
  public.alt_qr_screenshots, public.alt_qr_visual_comparisons to service_role;
grant usage, select on sequence public.alt_qr_scan_metrics_id_seq to service_role;
