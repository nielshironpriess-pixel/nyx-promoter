-- Kør denne i Supabase (SQL Editor -> New query -> Run), så underpromotere kan få notifikationer fra dig.

-- chefen sender besked til en underpromoter (fx "dine gæster er skrevet på")
create or replace function public.nyx_member_push(p_member uuid) returns setof jsonb
language sql stable security definer set search_path = public as $$
  select p.sub from nyx_push p join nyx_crew c on c.member = p.user_id where c.member = p_member and c.boss = auth.uid()
$$;
create or replace function public.nyx_member_push_gone(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  delete from nyx_push p using nyx_crew c where p.endpoint = p_endpoint and c.boss = auth.uid() and p.user_id = c.member
$$;
grant execute on function public.nyx_member_push(uuid), public.nyx_member_push_gone(text) to authenticated;
revoke execute on function public.nyx_member_push(uuid), public.nyx_member_push_gone(text) from anon;
