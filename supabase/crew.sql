-- Niels Bordbog: underpromotere (fx Gabriel) og notifikationer.
-- Kør hele filen i Supabase → SQL Editor → New query → Run. Den kan køres flere gange.
-- Chefen laver en kode. Underpromoteren opretter sin konto og skriver koden.
-- Chefen kan derefter se og rette alle underpromoterens borde og får en notifikation på telefonen, når der bookes.

create table if not exists public.nyx_crew (
  member uuid primary key references auth.users(id) on delete cascade,
  boss uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  joined_at timestamptz not null default now(),
  check (member <> boss)
);
create index if not exists nyx_crew_boss on public.nyx_crew(boss);

create table if not exists public.nyx_invites (
  code text primary key,
  boss uuid not null references auth.users(id) on delete cascade,
  email text,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.nyx_push (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sub jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.nyx_crew enable row level security;
alter table public.nyx_invites enable row level security;
alter table public.nyx_push enable row level security;

-- chefen ser sine underpromotere, underpromoteren ser sig selv
drop policy if exists "crew se" on public.nyx_crew;
create policy "crew se" on public.nyx_crew for select to authenticated using (boss = auth.uid() or member = auth.uid());
drop policy if exists "crew fjern" on public.nyx_crew;
create policy "crew fjern" on public.nyx_crew for delete to authenticated using (boss = auth.uid());
drop policy if exists "koder se" on public.nyx_invites;
create policy "koder se" on public.nyx_invites for select to authenticated using (boss = auth.uid());
drop policy if exists "koder slet" on public.nyx_invites;
create policy "koder slet" on public.nyx_invites for delete to authenticated using (boss = auth.uid());
drop policy if exists "push egne" on public.nyx_push;
create policy "push egne" on public.nyx_push for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- chefen kan se og rette underpromoterens data
drop policy if exists "chef ser" on public.nyx_docs;
create policy "chef ser" on public.nyx_docs for select to authenticated
  using (owner in (select member from public.nyx_crew where boss = auth.uid()));
drop policy if exists "chef retter" on public.nyx_docs;
create policy "chef retter" on public.nyx_docs for update to authenticated
  using (owner in (select member from public.nyx_crew where boss = auth.uid()))
  with check (owner in (select member from public.nyx_crew where boss = auth.uid()));

-- lav en kode (kun til chefen selv)
create or replace function public.nyx_crew_invite(p_email text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'Log ind først'; end if;
  if exists (select 1 from nyx_crew where member = auth.uid()) then raise exception 'Underpromotere kan ikke lave koder'; end if;
  loop
    c := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from nyx_invites where code = c);
  end loop;
  insert into nyx_invites(code, boss, email) values (c, auth.uid(), nullif(lower(trim(p_email)), ''));
  return c;
end $$;

-- brug en kode
create or replace function public.nyx_crew_join(p_code text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare i nyx_invites%rowtype; me_email text;
begin
  if auth.uid() is null then raise exception 'Log ind først'; end if;
  select * into i from nyx_invites where code = upper(trim(p_code));
  if not found then raise exception 'Koden findes ikke'; end if;
  if i.used_by is not null and i.used_by <> auth.uid() then raise exception 'Koden er allerede brugt'; end if;
  if i.boss = auth.uid() then raise exception 'Du kan ikke bruge din egen kode'; end if;
  select lower(email) into me_email from auth.users where id = auth.uid();
  if i.email is not null and i.email <> me_email then raise exception 'Koden er lavet til en anden email (%)', i.email; end if;
  insert into nyx_crew(member, boss, name) values (auth.uid(), i.boss, coalesce(nullif(trim(p_name), ''), split_part(me_email, '@', 1)))
    on conflict (member) do update set boss = excluded.boss, name = excluded.name;
  update nyx_invites set used_by = auth.uid() where code = i.code;
  return i.boss::text;
end $$;

-- hvem er jeg: chef, underpromoter eller ingen af delene
create or replace function public.nyx_role() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'boss', (select jsonb_build_object('id', boss, 'me', name, 'name', coalesce((select (d.data->'profile'->>'name') from nyx_docs d where d.owner = c.boss and d.col = 'settings' and d.id = 'main'), 'Din chef')) from nyx_crew c where member = auth.uid()),
    'crew', coalesce((select jsonb_agg(jsonb_build_object('id', member, 'name', name, 'email', (select email from auth.users u where u.id = member)) order by joined_at) from nyx_crew where boss = auth.uid()), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'email', email) order by created_at desc) from nyx_invites where boss = auth.uid() and used_by is null), '[]'::jsonb)
  )
$$;

-- push-abonnementer for den, der skal have besked (chefen for den der kalder)
create or replace function public.nyx_boss_push() returns setof jsonb
language sql stable security definer set search_path = public as $$
  select p.sub from nyx_push p join nyx_crew c on c.boss = p.user_id where c.member = auth.uid()
$$;
create or replace function public.nyx_push_gone(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from nyx_push p using nyx_crew c where p.endpoint = p_endpoint and c.member = auth.uid() and p.user_id = c.boss
$$;

grant execute on function public.nyx_crew_invite(text), public.nyx_crew_join(text, text), public.nyx_role(), public.nyx_boss_push(), public.nyx_push_gone(text) to authenticated;
revoke execute on function public.nyx_crew_invite(text), public.nyx_crew_join(text, text), public.nyx_role(), public.nyx_boss_push(), public.nyx_push_gone(text) from anon;
