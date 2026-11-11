-- Catalog checks for all app tables and RPCs, including both browser roles.
\set ON_ERROR_STOP 1

do $$
declare
  t text;
  r text;
  f regprocedure;
begin
  -- Every table in public, so a new table can't be missed.
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public' and c.relname = t and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception 'FAILED: RLS not enabled and forced on %', t;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, 'public.' || t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'FAILED: % has table access to %', r, t;
      end if;
    end loop;
  end loop;
  raise notice 'ok - every table forces RLS and denies both browser roles';

  -- Include helpers and trigger functions as well as route-facing RPCs.
  -- Every function in public (helpers, triggers and RPCs), so a new one can't be missed.
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname <> 'rls_auto_enable'
             and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass
                             and d.objid = p.oid and d.deptype = 'e') loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, f, 'EXECUTE') then
        raise exception 'FAILED: % can execute %', r, f;
      end if;
    end loop;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'FAILED: service_role cannot execute %', f;
    end if;
  end loop;
  raise notice 'ok - app RPCs deny both browser roles and allow service_role';
end $$;
