-- Hive-løn: en person fra Hive kan se (og skrive beløb på) dine Hive-borde. Intet andet.
-- Kør i Supabase: SQL Editor -> New query -> indsæt -> Run.

create table if not exists public.nyx_viewers (
  viewer uuid primary key references auth.users(id) on delete cascade,
  boss uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  joined_at timestamptz not null default now(),
  check (viewer <> boss)
);
create table if not exists public.nyx_viewer_codes (
  code text primary key,
  boss uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_by uuid
);
alter table public.nyx_viewers enable row level security;
alter table public.nyx_viewer_codes enable row level security;
drop policy if exists "chef ser hive-løn" on public.nyx_viewers;
create policy "chef ser hive-løn" on public.nyx_viewers for select to authenticated using (boss = auth.uid() or viewer = auth.uid());
drop policy if exists "chef fjerner hive-løn" on public.nyx_viewers;
create policy "chef fjerner hive-løn" on public.nyx_viewers for delete to authenticated using (boss = auth.uid());
drop policy if exists "chef ser hive-koder" on public.nyx_viewer_codes;
create policy "chef ser hive-koder" on public.nyx_viewer_codes for select to authenticated using (boss = auth.uid());

-- chefen laver en kode
create or replace function public.nyx_viewer_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  c := 'H' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
  insert into nyx_viewer_codes(code, boss) values (c, auth.uid());
  return c;
end $$;

-- personen fra Hive bruger koden
create or replace function public.nyx_viewer_join(p_code text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare i nyx_viewer_codes;
begin
  select * into i from nyx_viewer_codes where code = upper(trim(p_code)) and used_by is null;
  if i is null then raise exception 'Koden findes ikke eller er brugt'; end if;
  if i.boss = auth.uid() then raise exception 'Du kan ikke bruge din egen kode'; end if;
  insert into nyx_viewers(viewer, boss, name)
    values (auth.uid(), i.boss, coalesce(nullif(trim(p_name), ''), (select split_part(email, '@', 1) from auth.users where id = auth.uid())))
    on conflict (viewer) do update set boss = excluded.boss, name = excluded.name;
  update nyx_viewer_codes set used_by = auth.uid() where code = i.code;
  return i.boss::text;
end $$;

-- personen fra Hive henter chefens Hive-borde (null hvis man ikke er Hive-løn)
create or replace function public.nyx_viewer_data() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when v.viewer is null then null else jsonb_build_object(
    'me', v.name,
    'boss', coalesce((select s.data->'profile'->>'name' from nyx_docs s where s.owner = v.boss and s.col = 'settings' and s.id = 'main'), 'Din promoter'),
    'rows', coalesce((select jsonb_agg(d.data || jsonb_build_object('id', d.id) order by d.data->>'date')
      from nyx_docs d where d.owner = v.boss and d.col = 'bookings' and (d.data->>'club') ilike 'hive%'), '[]'::jsonb))
  end
  from (select 1) x left join nyx_viewers v on v.viewer = auth.uid();
$$;

-- personen fra Hive skriver hvad bordet brugte
create or replace function public.nyx_viewer_spent(p_id text, p_spent numeric) returns void
language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  select boss into b from nyx_viewers where viewer = auth.uid();
  if b is null then raise exception 'Ingen adgang'; end if;
  update nyx_docs set data = data || jsonb_build_object('spent', p_spent, 'status', case when p_spent > 0 then 'kom' else data->>'status' end, 'spentBy', 'hive'),
    updated_at = now()
  where owner = b and col = 'bookings' and id = p_id and (data->>'club') ilike 'hive%';
end $$;

-- chefen ser og fjerner sine Hive-løn personer
create or replace function public.nyx_viewer_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'viewers', coalesce((select jsonb_agg(jsonb_build_object('id', viewer, 'name', name, 'email', (select email from auth.users u where u.id = viewer)) order by joined_at) from nyx_viewers where boss = auth.uid()), '[]'::jsonb),
    'codes', coalesce((select jsonb_agg(code order by created_at desc) from nyx_viewer_codes where boss = auth.uid() and used_by is null), '[]'::jsonb));
$$;

grant execute on function public.nyx_viewer_code(), public.nyx_viewer_join(text, text), public.nyx_viewer_data(), public.nyx_viewer_spent(text, numeric), public.nyx_viewer_list() to authenticated;
revoke execute on function public.nyx_viewer_code(), public.nyx_viewer_join(text, text), public.nyx_viewer_data(), public.nyx_viewer_spent(text, numeric), public.nyx_viewer_list() from anon;
