-- Niels Bordbog: hold med fælles pulje.
-- Kør hele filen i Supabase → SQL Editor → New query → Run (efter nyx.sql).
-- Hver person ser kun sine egne borde, undtagen borde der er delt med holdet.
-- Holdet ser altid de samlede tal og får besked, når nogen booker eller skriver tal på et delt bord.

create table if not exists public.nyx_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Holdet' check (char_length(name) between 1 and 60),
  code text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.nyx_members (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  team_id uuid not null references public.nyx_teams(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  joined_at timestamptz not null default now()
);

create or replace function public.nyx_my_team() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.nyx_members where user_id = auth.uid()
$$;

alter table public.nyx_teams enable row level security;
alter table public.nyx_members enable row level security;
drop policy if exists "mit hold" on public.nyx_teams;
create policy "mit hold" on public.nyx_teams for select to authenticated using (id = public.nyx_my_team());
drop policy if exists "holdets medlemmer" on public.nyx_members;
create policy "holdets medlemmer" on public.nyx_members for select to authenticated using (team_id = public.nyx_my_team());
drop policy if exists "mit navn" on public.nyx_members;
create policy "mit navn" on public.nyx_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and team_id = public.nyx_my_team());

-- delte borde: team er sat på bordet, og alle på holdet kan se og rette det
alter table public.nyx_docs add column if not exists team uuid references public.nyx_teams(id) on delete set null;
create index if not exists nyx_docs_team on public.nyx_docs(team);
drop policy if exists "egne data" on public.nyx_docs;
drop policy if exists "se" on public.nyx_docs;
drop policy if exists "opret" on public.nyx_docs;
drop policy if exists "ret" on public.nyx_docs;
drop policy if exists "slet" on public.nyx_docs;
create policy "se" on public.nyx_docs for select to authenticated
  using (owner = auth.uid() or (team is not null and team = public.nyx_my_team()));
create policy "opret" on public.nyx_docs for insert to authenticated
  with check (owner = auth.uid() and (team is null or team = public.nyx_my_team()));
create policy "ret" on public.nyx_docs for update to authenticated
  using (owner = auth.uid() or (team is not null and team = public.nyx_my_team()))
  with check ((owner = auth.uid() and team is null) or team = public.nyx_my_team());
create policy "slet" on public.nyx_docs for delete to authenticated
  using (owner = auth.uid());

-- beskeder til holdet
create table if not exists public.nyx_news (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.nyx_teams(id) on delete cascade,
  actor uuid not null,
  owner uuid not null,
  booking text not null,
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists nyx_news_team on public.nyx_news(team_id, created_at desc);
alter table public.nyx_news enable row level security;
drop policy if exists "holdets nyheder" on public.nyx_news;
create policy "holdets nyheder" on public.nyx_news for select to authenticated using (team_id = public.nyx_my_team());

-- tal fra en booking (gemt som tal eller tom tekst)
create or replace function public.nyx_num(v jsonb) returns numeric
language sql immutable as $$
  select case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric else 0 end
$$;

-- holdets samlede tal for en periode: kun summer pr. person, aldrig kunder eller borde
create or replace function public.nyx_team_stats(p_from text, p_to text)
returns table (user_id uuid, name text, tables int, came int, expected numeric, sold numeric, mer numeric)
language sql stable security definer set search_path = public as $$
  select m.user_id, m.name,
    count(d.id) filter (where d.data->>'status' is distinct from 'aflyst')::int,
    count(d.id) filter (where d.data->>'status' = 'kom')::int,
    coalesce(sum(nyx_num(d.data->'expected')) filter (where d.data->>'status' is distinct from 'aflyst'), 0),
    coalesce(sum(nyx_num(d.data->'spent')) filter (where d.data->>'status' = 'kom'), 0),
    coalesce(sum(greatest(nyx_num(d.data->'spent') - nyx_num(d.data->'expected'), 0)) filter (where d.data->>'status' = 'kom' and nyx_num(d.data->'spent') > 0), 0)
  from nyx_members m
  left join nyx_docs d on d.owner = m.user_id and d.col = 'bookings' and d.data->>'date' between p_from and p_to
  where m.team_id = nyx_my_team()
  group by m.user_id, m.name, m.joined_at
  order by m.joined_at
$$;

create or replace function public.nyx_news_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text; what text; d jsonb := new.data; place text; dt text;
begin
  if new.col <> 'bookings' or new.team is null then return new; end if;
  select name into who from nyx_members where user_id = auth.uid();
  if who is null then return new; end if;
  place := coalesce(nullif(d->>'club', ''), 'Søpavillonen');
  dt := case when d->>'date' ~ '^\d{4}-\d{2}-\d{2}$' then to_char((d->>'date')::date, 'DD.MM') else '' end;
  what := 'bord ' || coalesce(nullif(d->>'table', ''), '?') || ' på ' || place || ' ' || dt || coalesce(' (' || nullif(d->>'name', '') || ')', '');
  if tg_op = 'INSERT' or old.team is null then
    insert into nyx_news(team_id, actor, owner, booking, text) values (new.team, auth.uid(), new.owner, new.id, who || ' delte ' || what);
  elsif nyx_num(d->'spent') <> nyx_num(old.data->'spent') and nyx_num(d->'spent') > 0 then
    insert into nyx_news(team_id, actor, owner, booking, text) values (new.team, auth.uid(), new.owner, new.id,
      who || ' skrev brugt ' || replace(to_char(nyx_num(d->'spent'), 'FM999G999G990'), ',', '.') || ' kr. på ' || what);
  elsif d->>'status' is distinct from old.data->>'status' or d->>'date' is distinct from old.data->>'date' or nyx_num(d->'expected') <> nyx_num(old.data->'expected') then
    insert into nyx_news(team_id, actor, owner, booking, text) values (new.team, auth.uid(), new.owner, new.id, who || ' rettede ' || what);
  end if;
  return new;
end $$;
drop trigger if exists nyx_news_after on public.nyx_docs;
create trigger nyx_news_after after insert or update on public.nyx_docs for each row execute function public.nyx_news_trigger();

create or replace function public.nyx_create_team(p_team text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare t uuid; c text;
begin
  if auth.uid() is null then raise exception 'Ikke logget ind'; end if;
  if exists (select 1 from nyx_members where user_id = auth.uid()) then raise exception 'Du er allerede på et hold'; end if;
  c := upper(substr(md5(gen_random_uuid()::text), 1, 6));
  insert into nyx_teams(name, code) values (coalesce(nullif(trim(p_team), ''), 'Holdet'), c) returning id into t;
  insert into nyx_members(user_id, team_id, name) values (auth.uid(), t, coalesce(nullif(trim(p_name), ''), 'Mig'));
  return c;
end $$;

create or replace function public.nyx_join_team(p_code text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'Ikke logget ind'; end if;
  if exists (select 1 from nyx_members where user_id = auth.uid()) then raise exception 'Du er allerede på et hold'; end if;
  select id into t from nyx_teams where code = upper(trim(p_code));
  if t is null then raise exception 'Koden findes ikke'; end if;
  insert into nyx_members(user_id, team_id, name) values (auth.uid(), t, coalesce(nullif(trim(p_name), ''), 'Ven'));
  return t;
end $$;

create or replace function public.nyx_leave_team() returns void
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select team_id into t from nyx_members where user_id = auth.uid();
  if t is null then return; end if;
  update nyx_docs set team = null where owner = auth.uid();
  delete from nyx_members where user_id = auth.uid();
  if not exists (select 1 from nyx_members where team_id = t) then delete from nyx_teams where id = t; end if;
end $$;

revoke all on function public.nyx_my_team(), public.nyx_team_stats(text, text), public.nyx_create_team(text, text), public.nyx_join_team(text, text), public.nyx_leave_team() from public, anon;
grant execute on function public.nyx_my_team(), public.nyx_team_stats(text, text), public.nyx_create_team(text, text), public.nyx_join_team(text, text), public.nyx_leave_team() to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.nyx_news;
exception when duplicate_object then null; end $$;
