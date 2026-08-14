-- ALT QR V2: additive release intelligence and defensible scan metadata.
-- Existing ALT QR and historical ALT AI data remain intact.

alter table public.alt_qr_projects
  add column if not exists baseline_scan_id uuid references public.alt_qr_scans(id) on delete set null,
  add column if not exists gate_config jsonb not null default '{"minimumScore":80,"failOnCritical":true,"maximumBrokenPages":0,"maximumBrokenLinks":0}'::jsonb,
  add column if not exists ignored_fingerprints text[] not null default '{}'::text[];

alter table public.alt_qr_scans
  drop constraint if exists alt_qr_scans_stage_check;

alter table public.alt_qr_scans
  add constraint alt_qr_scans_stage_check
  check (stage in ('QUEUED','DISCOVERING','INSPECTING','AUDITING','CAPTURING','COMPARING','SCORING','COMPLETE','CANCELLED','FAILED'));

alter table public.alt_qr_scans
  add column if not exists rules_version text not null default '1.0.0',
  add column if not exists config_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists release_gate jsonb not null default '{}'::jsonb,
  add column if not exists verdict text,
  add column if not exists comparisons jsonb not null default '{}'::jsonb,
  add column if not exists page_health jsonb not null default '[]'::jsonb,
  add column if not exists issue_groups jsonb not null default '[]'::jsonb,
  add column if not exists fix_queue jsonb not null default '[]'::jsonb,
  add column if not exists coverage jsonb not null default '{}'::jsonb,
  add column if not exists timings jsonb not null default '{}'::jsonb,
  add column if not exists performance jsonb not null default '[]'::jsonb;

alter table public.alt_qr_scans
  drop constraint if exists alt_qr_scans_verdict_check;

alter table public.alt_qr_scans
  add constraint alt_qr_scans_verdict_check
  check (verdict is null or verdict in ('READY TO SHIP','READY WITH WARNINGS','NEEDS ATTENTION','BLOCKED'));

alter table public.alt_qr_pages
  add column if not exists redirects smallint not null default 0 check (redirects >= 0),
  add column if not exists console_warnings jsonb not null default '[]'::jsonb,
  add column if not exists console_events jsonb not null default '[]'::jsonb,
  add column if not exists network_failures jsonb not null default '[]'::jsonb,
  add column if not exists event_limits jsonb not null default '{}'::jsonb,
  add column if not exists failure jsonb;

alter table public.alt_qr_issues
  add column if not exists scope text not null default 'PAGE' check (scope in ('SITE','PAGE')),
  add column if not exists lifecycle text not null default 'ACTIVE' check (lifecycle in ('ACTIVE','IGNORED')),
  add column if not exists occurrences integer not null default 1 check (occurrences >= 1),
  add column if not exists affected_page_ids uuid[] not null default '{}'::uuid[];

alter table public.alt_qr_screenshots
  add column if not exists source_viewport text check (source_viewport is null or source_viewport in ('desktop','mobile')),
  add column if not exists comparison_target text check (comparison_target is null or comparison_target in ('previous','baseline'));

alter table public.alt_qr_visual_comparisons
  add column if not exists viewport text not null default 'desktop' check (viewport in ('desktop','mobile')),
  add column if not exists comparison_target text not null default 'previous' check (comparison_target in ('previous','baseline')),
  add column if not exists rating text not null default 'NO MEANINGFUL CHANGE'
    check (rating in ('NO MEANINGFUL CHANGE','MINOR CHANGE','VISIBLE CHANGE','MAJOR CHANGE'));

do $$
declare
  legacy_constraint text;
begin
  select conname into legacy_constraint
  from pg_constraint
  where conrelid = 'public.alt_qr_visual_comparisons'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) = 'UNIQUE (baseline_scan_id, current_scan_id)'
  limit 1;
  if legacy_constraint is not null then
    execute format('alter table public.alt_qr_visual_comparisons drop constraint %I', legacy_constraint);
  end if;
end $$;

alter table public.alt_qr_visual_comparisons
  add constraint alt_qr_visual_comparisons_scan_viewport_target_key
  unique (baseline_scan_id, current_scan_id, viewport, comparison_target);

create index if not exists alt_qr_projects_baseline_scan_id_idx on public.alt_qr_projects(baseline_scan_id);
create index if not exists alt_qr_scans_project_created_at_idx on public.alt_qr_scans(project_id, created_at desc);
create index if not exists alt_qr_issues_fingerprint_idx on public.alt_qr_issues(fingerprint);
create index if not exists alt_qr_issues_scan_lifecycle_idx on public.alt_qr_issues(scan_id, lifecycle);

revoke all on public.alt_qr_projects, public.alt_qr_scans, public.alt_qr_pages,
  public.alt_qr_issues, public.alt_qr_scan_metrics, public.alt_qr_screenshots,
  public.alt_qr_visual_comparisons from anon, authenticated;

grant select, insert, update on public.alt_qr_projects, public.alt_qr_scans,
  public.alt_qr_pages, public.alt_qr_issues, public.alt_qr_scan_metrics,
  public.alt_qr_screenshots, public.alt_qr_visual_comparisons to service_role;
