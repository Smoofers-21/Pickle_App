\set ON_ERROR_STOP 1
begin;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;

do $$
declare r jsonb; l uuid; h uuid; a uuid; g uuid; first_token uuid; token uuid; n integer;
begin
  r := public.create_lobby('FENC23', 'Host', 'fence-host');
  l := (r->>'lobby_id')::uuid; h := (r->>'member_id')::uuid;
  a := (public.join_lobby('FENC23', 'Left member', 'fence-left')->>'member_id')::uuid;
  g := (public.start_game(l,h,'food',null,5,'all','either',1::smallint,30,-97,'America/Chicago')->>'game_id')::uuid;
  perform public.submit_picks(g,a,'italian',null,null,null);
  perform public.leave_lobby(l,a);
  perform public.submit_picks(g,h,'bbq',null,null,null);
  r := public.claim_search(g);
  first_token := (r->>'claim_token')::uuid;
  perform pg_temp.check(first_token is not null, 'search receives an ownership token');
  perform pg_temp.check(r->'active_member_ids' = jsonb_build_array(h), 'search preferences exclude departed members');
  update public.games set search_claimed_at = now() - interval '2 minutes' where id=g;
  r := public.claim_search(g); token := (r->>'claim_token')::uuid;
  perform pg_temp.check(token is not null and token <> first_token, 'takeover rotates the ownership token');
  perform pg_temp.check(not public.search_progress(g,'{"matches":99}',first_token), 'stale worker cannot overwrite progress');
  perform pg_temp.check(public.reserve_search_units(g,first_token,'geoapify',5,2500) = 'stale', 'stale worker cannot spend API credits');
  select count(*) into n from public.save_options(g,'[{"source":"geoapify","source_id":"old","name":"Stale place"}]',first_token);
  perform pg_temp.check(n=0 and not exists(select 1 from public.options where game_id=g), 'stale worker cannot save results');
  perform pg_temp.check(public.finish_search(g,'nothing_found','{}','[]',first_token)->>'status' = 'stale', 'stale worker cannot finish a replacement search');
  perform pg_temp.check(public.finish_search(g,'nothing_found','{}')->>'status' = 'stale', 'tokenless legacy finish is rejected');
  perform pg_temp.check(public.reserve_search_units(g,token,'geoapify',5,2500) = 'ok', 'current worker may reserve credits');
  perform pg_temp.check(public.search_progress(g,'{"matches":1}',token), 'current worker may report progress');
  perform public.save_options(g,'[{"source":"geoapify","source_id":"current","name":"Current place"}]',token);
  perform pg_temp.check(public.finish_search(g,'done','{}',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'score',70)),token)->>'status' = 'invalid_options',
    'finish rejects options that are not in this game');
  perform pg_temp.check(public.finish_search(g,'nothing_found','{}','[]',token)->>'status' = 'ok', 'current worker can finish');
  perform public.change_criteria(g,h,'food',null,10,'all','either',1::smallint,30,-97,'America/Chicago');
  r := public.claim_search(g); first_token := token; token := (r->>'claim_token')::uuid;
  perform pg_temp.check(public.finish_search(g,'nothing_found','{}','[]',first_token)->>'status' = 'stale', 'criteria reset fences out the prior search');
  update public.lobbies set expires_at=now()-interval '1 second' where id=l;
  perform pg_temp.check(public.reserve_search_units(g,token,'geoapify',5,2500) = 'stale', 'expired lobby rejects further provider spending');
  perform pg_temp.check(not public.search_progress(g,'{}',token), 'expired lobby rejects worker progress');
  update public.lobbies set expires_at=now()+interval '1 day' where id=l;
  perform public.end_game(l,h);
  perform pg_temp.check(public.reserve_search_units(g,token,'geoapify',5,2500) = 'stale', 'ended game rejects further provider spending');
end $$;
rollback;
