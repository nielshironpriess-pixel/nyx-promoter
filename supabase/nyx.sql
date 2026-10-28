-- Nyx Promoter: én tabel til Supabase.
-- Kør hele filen i Goon-projektet: Supabase → SQL Editor → New query → Run.
-- Låst med Row Level Security: hver bruger ser og ændrer kun sine egne bookinger, aftener og noter.

create table if not exists public.nyx_docs (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  col text not null check (col in ('bookings','nights','notes','settings')),
  id text not null check (char_length(id) between 1 and 64),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 20000),
  updated_at timestamptz not null default now(),
  primary key (owner, col, id)
);

alter table public.nyx_docs enable row level security;

drop policy if exists "egne data" on public.nyx_docs;
create policy "egne data" on public.nyx_docs for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

-- Live-opdatering mellem telefon og computer
do $$ begin
  alter publication supabase_realtime add table public.nyx_docs;
exception when duplicate_object then null; end $$;
