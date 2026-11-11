-- Provider caching contract; isolated fixtures, no external API or key.
\set ON_ERROR_STOP 1
begin;
do $$
declare
  r jsonb;
  v_game uuid;
begin
  r := public.create_lobby('GEX223', 'Provider test', 'provider-test-device');
  v_game := (public.start_game((r->>'lobby_id')::uuid, (r->>'member_id')::uuid,
    'food', null, 5, 'all', 'either', 1::smallint, 0, 0)->>'game_id')::uuid;
  insert into public.options (game_id, source, source_id) values
    (v_game, 'geoapify', 'geoapify-test'),
    (v_game, 'ticketmaster', 'ticketmaster-test'),
    (v_game, 'google', 'legacy-test');
  raise notice 'ok - cache accepts Geoapify, Ticketmaster and legacy Google rows';
  begin
    insert into public.options (game_id, source, source_id) values (v_game, 'unknown', 'invalid-test');
    raise exception 'FAILED: invalid provider source accepted';
  exception when check_violation then
    raise notice 'ok - cache rejects unknown provider sources';
  end;
end $$;
rollback;
