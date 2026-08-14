-- 0001_init.sql
-- Инициализация БД под RAG: pgvector, таблица документов, семантический поиск, RLS.
-- Готово к запуску целиком в Supabase SQL Editor (или через `supabase db push`).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Расширение pgvector.
--    Даёт тип vector(N), операторы расстояния (<=> косинус, <-> L2, <#> inner)
--    и индексы HNSW / IVFFlat.
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Таблица документов (чанков корпуса).
--    embedding — 768 измерений под nomic-embed-text.
--    metadata — not null default '{}', чтобы фильтр `@>` не спотыкался о NULL.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.documents (
  id         bigserial   primary key,
  content    text        not null,
  metadata   jsonb       not null default '{}'::jsonb,
  embedding  vector(768),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Индексы.
--    HNSW по эмбеддингу с vector_cosine_ops — быстрый приближённый ANN-поиск
--    под оператор косинусного расстояния <=>. Строится и на пустой таблице.
--    GIN по metadata ускоряет фильтрацию `metadata @> filter` в match_documents.
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists documents_embedding_hnsw_idx
  on public.documents
  using hnsw (embedding vector_cosine_ops);

create index if not exists documents_metadata_gin_idx
  on public.documents
  using gin (metadata);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Функция семантического поиска.
--    Возвращает топ-N ближайших документов, опционально сузив выборку по
--    метаданным (metadata @> filter).
--    similarity = 1 - косинусное расстояние (1.0 — идеальное совпадение).
--    `stable` — результат не меняется в пределах одного стейтмента (позволяет
--    планировщику кэшировать вызов). `set search_path = public` фиксирует путь
--    поиска и снимает предупреждение линтера о mutable search_path.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.match_documents(
  query_embedding vector(768),
  match_count int default 5,
  filter jsonb default '{}'::jsonb
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
set search_path = public
as $$
  select
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.documents as d
  where d.embedding is not null
    and d.metadata @> filter
  order by d.embedding <=> query_embedding
  limit greatest(match_count, 0)
$$;

-- Право вызова ролям API. Функция не SECURITY DEFINER — исполняется от имени
-- вызывающего, поэтому RLS таблицы documents соблюдается.
grant execute on function public.match_documents(vector, int, jsonb)
  to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Row Level Security.
--    Читать могут все роли; писать — только service_role.
--    service_role в Supabase имеет BYPASSRLS и обходит политики, поэтому
--    серверный клиент пишет свободно, а anon/authenticated без политик на
--    запись сделать её не могут. Явная политика ниже декларирует намерение.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.documents enable row level security;

-- Чтение доступно всем ролям (публичный на чтение корпус).
drop policy if exists documents_select_all on public.documents;
create policy documents_select_all
  on public.documents
  for select
  using (true);

-- Полный доступ только для service_role (серверный клиент).
drop policy if exists documents_write_service_role on public.documents;
create policy documents_write_service_role
  on public.documents
  for all
  to service_role
  using (true)
  with check (true);
