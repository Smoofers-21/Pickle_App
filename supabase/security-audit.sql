-- Read-only audit for the deployed schema. Run after applying the matching
-- migrations, using the Supabase SQL editor or psql with ON_ERROR_STOP=1.
-- Reads catalogs only: no member data, keys, locations, application writes,
-- migrations, or changes to permissions. Failure means investigation is needed.
begin read only;
do $$
declare t text; r text; signature text; f regprocedure;
begin
  foreach t in array array['lobbies','members','games','picks','options','card_views',
                           'votes','round_results','rate_limits','api_usage'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=t and c.relrowsecurity and c.relforcerowsecurity) then
      raise exception 'Missing table or forced RLS: %',t;
    end if;
    foreach r in array array['anon','authenticated'] loop
      if has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'Unexpected browser table privilege: % on %',r,t;
      end if;
      if pg_has_role(r,'service_role','MEMBER') then raise exception '% inherits service_role',r; end if;
    end loop;
  end loop;

  foreach signature in array array[
    'public.claim_search(uuid,integer)', 'public.lock_search_claim(uuid,uuid)',
    'public.reserve_search_units(uuid,uuid,text,integer,integer)',
    'public.search_progress(uuid,jsonb,uuid)', 'public.save_options(uuid,jsonb,uuid)',
    'public.finish_search(uuid,text,jsonb,jsonb,uuid)',
    'public.change_criteria(uuid,uuid,text,date,numeric,text,text,smallint,double precision,double precision,text)',
    'public.end_game(uuid,uuid)',
    'public.start_game(uuid,uuid,text,date,numeric,text,text,smallint,double precision,double precision,text)',
    'public.submit_vote(uuid,uuid,smallint,uuid[])', 'public.unready_vote(uuid,uuid,smallint)',
    'public.advance_after_votes(uuid)', 'public.continue_after_round(uuid,uuid)',
    'public.tally_round(public.games,smallint)', 'public.ballot_options(uuid,smallint)',
    'public.change_lobby(uuid,uuid,text)', 'public.moved_lobby_code(text,text)'] loop
    f:=to_regprocedure(signature);
    if f is null then raise exception 'Missing required RPC: %',signature; end if;
  end loop;

  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and not exists(select 1 from pg_depend d
      where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') loop
    foreach r in array array['anon','authenticated'] loop
      if has_function_privilege(r,f,'EXECUTE') then raise exception 'Browser can execute %: %',f,r; end if;
    end loop;
    if not has_function_privilege('service_role',f,'EXECUTE') and f::text not like '%rls_auto_enable%' then
      raise exception 'service_role lacks EXECUTE on %',f;
    end if;
  end loop;

  if not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='games' and column_name='search_claim_token' and data_type='uuid') then
    raise exception 'Missing search ownership token column';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='votes' and column_name='ready' and data_type='boolean') then
    raise exception 'Missing votes.ready column (voting migration)';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.options'::regclass
      and conname='options_source_check' and pg_get_constraintdef(oid) like '%geoapify%') then
    raise exception 'Options source constraint does not support Geoapify';
  end if;
  if to_regprocedure('public.save_options(uuid,jsonb)') is not null
    or to_regprocedure('public.search_progress(uuid,jsonb)') is not null
    or to_regprocedure('public.finish_search(uuid,text,jsonb,jsonb)') is not null then
    raise exception 'Unfenced search RPC overload remains';
  end if;
  raise notice 'PASS: required schema/RPCs, provider source, forced RLS, browser grants, worker signatures, voting and change lobby';
end $$;
rollback;
