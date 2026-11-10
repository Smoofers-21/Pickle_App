-- Catalog checks for all app tables and RPCs, including both browser roles.
\set ON_ERROR_STOP 1

do $$
declare
  t text;
  r text;
  f regprocedure;
begin
  foreach t in array array['lobbies', 'members', 'games', 'picks', 'options',
                           'card_views', 'votes', 'round_results', 'rate_limits'] loop
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
  raise notice 'ok - all nine tables force RLS and deny both browser roles';

  -- Include helpers and trigger functions as well as route-facing RPCs.
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'notify_lobby_changed', 'on_lobby_row_changed', 'on_game_row_changed',
             'rate_limit_hit', 'next_free_name', 'hand_over_host', 'create_lobby',
             'join_lobby', 'check_lobby_code', 'leave_lobby', 'remove_member',
             'advance_after_picks', 'start_game', 'submit_picks', 'unready_picks', 'add_demo_friends') loop
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
