-- Nyx Promoter: tabeller til Supabase.
-- Kør hele filen i Supabase → SQL Editor → New query → Run.
-- Kan køres i samme projekt som Goon. Alt er låst med Row Level Security:
-- hver bruger ser og ændrer kun sine egne nætter, borde og satser.

create table if not exists public.nyx_settings (
  owner uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text not null default '',
  per_guest numeric not null default 20,
  ticket_pct numeric not null default 10,
  table_pct numeric not null default 10,
  goal numeric not null default 15000,
  updated_at timestamptz not null default now()
);

create table if not exists public.nyx_nights (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  event text not null default '' check (char_length(event) <= 80),
  guests integer not null default 0 check (guests >= 0),
  tickets integer not null default 0 check (tickets >= 0),
  ticket_revenue numeric not null default 0,
  bonus numeric not null default 0,
  paid boolean not null default false,
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (owner, date)
);

create table if not exists public.nyx_tables (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  name text not null default '' check (char_length(name) <= 80),
  phone text not null default '' check (char_length(phone) <= 30),
  table_name text not null default '' check (char_length(table_name) <= 30),
  people integer not null default 0 check (people >= 0),
  min_spend numeric not null default 0,
  spend numeric not null default 0,
  status text not null default 'booket' check (status in ('booket','kom','noshow','aflyst')),
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists nyx_nights_owner_date on public.nyx_nights (owner, date);
create index if not exists nyx_tables_owner_date on public.nyx_tables (owner, date);

alter table public.nyx_settings enable row level security;
alter table public.nyx_nights enable row level security;
alter table public.nyx_tables enable row level security;

drop policy if exists "egne satser" on public.nyx_settings;
create policy "egne satser" on public.nyx_settings for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "egne nætter" on public.nyx_nights;
create policy "egne nætter" on public.nyx_nights for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "egne borde" on public.nyx_tables;
create policy "egne borde" on public.nyx_tables for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());

-- Live-opdatering mellem telefon og computer
do $$ begin
  begin alter publication supabase_realtime add table public.nyx_nights; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.nyx_tables; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.nyx_settings; exception when duplicate_object then null; end;
end $$;
