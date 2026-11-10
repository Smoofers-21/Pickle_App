-- Stand-ins for what Supabase provides, so the migrations can be tested on a
-- plain local Postgres. Never run this on Supabase.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema realtime;
create table realtime.sent (payload jsonb, event text, topic text, private boolean, at timestamptz default clock_timestamp());
create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql as $$ insert into realtime.sent values (payload, event, topic, private) $$;
