-- Preserve bounded scanner-subsystem failures without misclassifying them as site errors.
alter table public.alt_qr_pages
  add column if not exists audit_failures jsonb not null default '[]'::jsonb;
