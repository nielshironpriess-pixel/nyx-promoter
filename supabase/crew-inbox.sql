-- Lader chefen oprette en underpromoters indbakke, hvis den ikke findes endnu,
-- så beskeder kommer frem, selv om underpromoteren ikke har åbnet den nye version.
drop policy if exists "chef opretter indbakke" on public.nyx_docs;
create policy "chef opretter indbakke" on public.nyx_docs for insert to authenticated
  with check (col = 'inbox' and owner in (select member from public.nyx_crew where boss = auth.uid()));
