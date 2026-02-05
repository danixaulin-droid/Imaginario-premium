-- ========= Imaginário Premium (Supabase) =========
-- 1) Rode este SQL no Supabase (SQL Editor)
-- 2) Crie o bucket Storage: "imaginario"
-- 3) (Opcional) deixe o bucket público para simplificar URLs

create extension if not exists "pgcrypto";

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  kind text not null check (kind in ('generate','edit')),
  prompt text not null,
  size text not null,
  n int not null default 1,
  results jsonb not null default '[]'::jsonb
);

alter table public.generations enable row level security;

-- Usuário lê e escreve somente seus registros
create policy "generations_select_own"
on public.generations
for select
using (auth.uid() = user_id);

create policy "generations_insert_own"
on public.generations
for insert
with check (auth.uid() = user_id);

-- (Opcional) Se quiser permitir admin ler tudo:
-- create policy "generations_select_admin"
-- on public.generations
-- for select
-- using (auth.jwt() ->> 'email' = current_setting('app.admin_email', true));

-- ========= Storage (recomendado) =========
-- No dashboard do Supabase:
-- Storage -> New bucket -> name: imaginario
-- Configure como PUBLIC (mais simples) ou PRIVATE (mais seguro).
--
-- Se PRIVATE, você precisa gerar Signed URLs no backend.
