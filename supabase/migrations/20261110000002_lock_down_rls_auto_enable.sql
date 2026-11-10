-- Pickle: stop browser roles calling Supabase's rls_auto_enable() (milestone 3)
--
-- Supabase creates public.rls_auto_enable() when "automatically enable RLS"
-- is chosen for a new project. It runs as an event trigger that turns on
-- row-level security for new tables. As an event-trigger function it can't
-- really be called over the API, but Supabase's security advisor flags it
-- because the browser roles have EXECUTE on it. The event trigger keeps
-- working without these grants.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
