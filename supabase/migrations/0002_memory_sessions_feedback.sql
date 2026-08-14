-- 0002_memory_sessions_feedback.sql
-- Server-first слои поверх RAG: долговременная память, серверные сессии, фидбек.
-- Готово к запуску целиком в Supabase SQL Editor (или `supabase db push`).
--
-- ВАЖНО про размерность эмбеддингов:
--   vector(768) совпадает с AI_EMBED_DIM по умолчанию (OpenAI text-embedding-3-small
--   c параметром dimensions=768). Если вы поменяете AI_EMBED_DIM, измените 768
--   здесь И в 0001, и переиндексируйте данные (эмбеддинги разных моделей
--   несравнимы между собой).
--
--   Доступ ко всем таблицам ниже идёт ТОЛЬКО через серверный клиент на
--   service_role (он обходит RLS). RLS включён и оставлен без anon-политик,
--   поэтому напрямую из браузера эти данные недоступны.

create extension if not exists vector;
create extension if not exists pgcrypto; -- gen_random_uuid()

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Долговременная память (Layer C: learned knowledge).
--    owner_id — анонимный идентификатор владельца (httpOnly-кука), не PII.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.memories (
  id         uuid        primary key default gen_random_uuid(),
  owner_id   text        not null,
  type       text        not null default 'fact',
  content    text        not null,
  embedding  vector(768),
  confidence real        not null default 0.6,
  source     text        not null default 'conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memories_owner_idx on public.memories (owner_id);
create index if not exists memories_embedding_hnsw_idx
  on public.memories using hnsw (embedding vector_cosine_ops);

-- Семантический поиск памяти в пределах одного владельца.
create or replace function public.match_memories(
  query_embedding vector(768),
  owner text,
  match_count int default 6,
  min_similarity float default 0.0
)
returns table (
  id uuid,
  type text,
  content text,
  confidence real,
  similarity float,
  updated_at timestamptz
)
language sql
stable
set search_path = public
as $$
  select
    m.id,
    m.type,
    m.content,
    m.confidence,
    1 - (m.embedding <=> query_embedding) as similarity,
    m.updated_at
  from public.memories as m
  where m.owner_id = owner
    and m.embedding is not null
    and 1 - (m.embedding <=> query_embedding) >= min_similarity
  order by m.embedding <=> query_embedding
  limit greatest(match_count, 0)
$$;

grant execute on function public.match_memories(vector, text, int, float) to service_role;

alter table public.memories enable row level security;
drop policy if exists memories_service_role on public.memories;
create policy memories_service_role on public.memories
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Серверные сессии (переживают закрытие браузера/ноутбука).
--    id — клиентский uuid (совпадает с локальным идентификатором сессии).
--    messages — jsonb-массив в форме UI (role/content/sources/status).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.sessions (
  id         text        primary key,
  owner_id   text        not null,
  title      text        not null default 'New conversation',
  messages   jsonb       not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sessions_owner_updated_idx
  on public.sessions (owner_id, updated_at desc);

alter table public.sessions enable row level security;
drop policy if exists sessions_service_role on public.sessions;
create policy sessions_service_role on public.sessions
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Фидбек по ответам (Useful / Not useful). Без авто-дообучения модели.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.feedback (
  id         uuid        primary key default gen_random_uuid(),
  owner_id   text        not null,
  session_id text,
  message_id text,
  rating     text        not null check (rating in ('useful', 'not_useful')),
  query      text,
  answer_preview text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_owner_idx on public.feedback (owner_id, created_at desc);

alter table public.feedback enable row level security;
drop policy if exists feedback_service_role on public.feedback;
create policy feedback_service_role on public.feedback
  for all to service_role using (true) with check (true);
