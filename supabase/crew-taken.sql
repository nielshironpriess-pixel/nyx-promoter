-- Underpromotere kan se hvilke borde chefen (og resten af holdet) har solgt,
-- men kun dato, område, bord og hvem. Ikke kundenavne eller beløb.
create or replace function public.nyx_taken(p_from date) returns setof jsonb
language sql security definer stable set search_path = public as $$
  with me as (select boss from nyx_crew where member = auth.uid()),
  owners as (select boss as id from me union select c.member from nyx_crew c join me on c.boss = me.boss)
  select jsonb_build_object(
    'date', d.data->>'date', 'area', coalesce(d.data->>'area', ''), 'table', d.data->>'table', 'club', coalesce(d.data->>'club', ''),
    'who', case when d.owner = (select boss from me)
      then coalesce((select s.data->'profile'->>'name' from nyx_docs s where s.owner = d.owner and s.col = 'settings' and s.id = 'main'), 'din promoter')
      else coalesce((select name from nyx_crew where member = d.owner), 'holdet') end)
  from nyx_docs d
  where d.col = 'bookings' and d.owner in (select id from owners) and d.owner <> auth.uid()
    and coalesce(d.data->>'status', '') <> 'aflyst' and (d.data->>'date') >= p_from::text;
$$;
grant execute on function public.nyx_taken(date) to authenticated;
revoke execute on function public.nyx_taken(date) from anon;
