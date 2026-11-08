-- Pickle: initial database schema (milestone 2)
--
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
--
-- Security model (see "Security and privacy" in docs/build-plan.md):
--   * Row-level security is ON for every table, with NO policies, so the
--     browser's publishable key can read or write nothing at all.
--   * Phones never touch tables directly. They call our own server routes,
--     which use the secret key and the functions below.
--   * Live updates reach phones as content-free "changed" pings on a Realtime
--     broadcast channel named after the lobby's random id. Phones then ask
--     the server for the new state, so picks and votes are never broadcast.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables (the 8 from the build plan's data model, plus rate_limits)
-- ---------------------------------------------------------------------------

create table public.lobbies (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  status          text not null default 'open' check (status in ('open', 'locked', 'ended')),
  host_member_id  uuid,
  is_demo         boolean not null default false,
  next_lobby_id   uuid references public.lobbies (id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '24 hours'
);

create table public.members (
  id                 uuid primary key default gen_random_uuid(),
  lobby_id           uuid not null references public.lobbies (id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 24),
  -- SHA-256 of the device token. The token itself lives only in the phone's
  -- HTTP-only cookie.
  device_token_hash  text,
  joined_at          timestamptz not null default clock_timestamp(),
  is_demo            boolean not null default false,
  removed_at         timestamptz,  -- removed by the host
  left_at            timestamptz,  -- left on their own
  last_seen_at       timestamptz not null default now()
);
create unique index members_lobby_name_key on public.members (lobby_id, lower(name));
create index members_lobby_idx on public.members (lobby_id, joined_at);
create index members_device_idx on public.members (lobby_id, device_token_hash);

alter table public.lobbies
  add constraint lobbies_host_member_fk
  foreign key (host_member_id) references public.members (id) on delete set null
  deferrable initially deferred;

create table public.games (
  id              uuid primary key default gen_random_uuid(),
  lobby_id        uuid not null references public.lobbies (id) on delete cascade,
  category        text not null check (category in ('food', 'bars', 'events')),
  event_date      date,
  radius_mi       numeric(4, 1) not null check (radius_mi > 0 and radius_mi <= 50),
  age             text not null default 'all' check (age in ('all', '21_plus')),
  indoor_outdoor  text not null default 'either' check (indoor_outdoor in ('either', 'indoor', 'outdoor')),
  rounds_total    smallint not null check (rounds_total between 1 and 3),
  current_round   smallint not null default 1,
  stage           text not null default 'picks'
                  check (stage in ('picks', 'searching', 'cards_and_voting', 'round_complete', 'final_vote', 'results')),
  center_lat      double precision,  -- host location; deleted when the game ends
  center_lng      double precision,
  created_at      timestamptz not null default now()
);
create index games_lobby_idx on public.games (lobby_id);

create table public.picks (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games (id) on delete cascade,
  member_id     uuid not null references public.members (id) on delete cascade,
  no_tag        text not null,
  yes_tag       text,
  other_text    text check (char_length(other_text) <= 40),
  submitted_at  timestamptz not null default now(),
  unique (game_id, member_id)
);

create table public.options (
  id               uuid primary key default gen_random_uuid(),
  game_id          uuid not null references public.games (id) on delete cascade,
  shown_in_round   smallint,  -- empty until shown
  source           text not null check (source in ('google', 'ticketmaster')),
  source_id        text not null,
  name             text,
  normalized_name  text,
  tags             text[] not null default '{}',
  photos           jsonb not null default '[]',
  hours            jsonb,
  start_time       timestamptz,
  rating           numeric(2, 1),
  distance_mi      numeric(5, 2),
  link             text,
  score            numeric(5, 2),  -- never shown to members
  created_at       timestamptz not null default now(),
  unique (game_id, source, source_id)
);

create table public.card_views (
  member_id  uuid not null references public.members (id) on delete cascade,
  option_id  uuid not null references public.options (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (member_id, option_id)
);

create table public.votes (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games (id) on delete cascade,
  round_no      smallint not null check (round_no between 0 and 3),  -- 0 = final
  member_id     uuid not null references public.members (id) on delete cascade,
  ranking       uuid[] not null,
  submitted_at  timestamptz not null default now(),
  unique (game_id, round_no, member_id)
);

create table public.round_results (
  game_id            uuid not null references public.games (id) on delete cascade,
  round_no           smallint not null,
  option_id          uuid not null references public.options (id) on delete cascade,
  points             integer not null default 0,
  first_place_votes  integer not null default 0,
  place              smallint,
  advanced           boolean not null default false,
  primary key (game_id, round_no, option_id)
);

-- Rate limits keyed by device (never by IP address: IPs stay in server memory).
create table public.rate_limits (
  bucket    text primary key,
  hits      integer not null,
  reset_at  timestamptz not null
);

-- ---------------------------------------------------------------------------
-- Lock everything down: RLS on, no policies, no grants to browser roles.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['lobbies', 'members', 'games', 'picks', 'options',
                           'card_views', 'votes', 'round_results', 'rate_limits']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Live update pings
-- ---------------------------------------------------------------------------

-- Sends an empty "changed" ping on the lobby's public broadcast channel.
-- Never fails the write that triggered it.
create or replace function public.notify_lobby_changed(p_lobby_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'lobby:' || p_lobby_id::text, false);
exception when others then
  raise warning 'notify_lobby_changed failed: %', sqlerrm;
end;
$$;

create or replace function public.on_lobby_row_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'lobbies' then
    perform public.notify_lobby_changed(coalesce(new.id, old.id));
  else
    perform public.notify_lobby_changed(coalesce(new.lobby_id, old.lobby_id));
  end if;
  return null;
end;
$$;

create trigger lobbies_changed
  after update on public.lobbies
  for each row execute function public.on_lobby_row_changed();

-- Heartbeats only touch last_seen_at; those don't ping the lobby.
create trigger members_changed
  after insert or delete or update of name, device_token_hash, removed_at, left_at
  on public.members
  for each row execute function public.on_lobby_row_changed();

-- ---------------------------------------------------------------------------
-- Lobby functions (called only by the server, with the secret key)
-- ---------------------------------------------------------------------------

-- Returns true when the action is allowed, false when over the limit.
create or replace function public.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare v_hits integer;
begin
  insert into public.rate_limits as r (bucket, hits, reset_at)
  values (p_bucket, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (bucket) do update
    set hits     = case when r.reset_at <= now() then 1 else r.hits + 1 end,
        reset_at = case when r.reset_at <= now() then excluded.reset_at else r.reset_at end
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- Picks the next name free in the lobby: "Sam", then "Sam 2", "Sam 3"...
create or replace function public.next_free_name(p_lobby_id uuid, p_name text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_name text := p_name;
  v_n integer := 1;
begin
  while exists (select 1 from public.members m
                where m.lobby_id = p_lobby_id and lower(m.name) = lower(v_name)) loop
    v_n := v_n + 1;
    v_name := left(p_name, 20) || ' ' || v_n;
  end loop;
  return v_name;
end;
$$;

-- Moves the host role to the earliest-joined active member, or ends the
-- lobby if nobody is left.
create or replace function public.hand_over_host(p_lobby_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare v_next uuid;
begin
  select m.id into v_next
  from public.members m
  where m.lobby_id = p_lobby_id and m.removed_at is null and m.left_at is null
  order by m.joined_at, m.id
  limit 1;

  if v_next is null then
    update public.lobbies set host_member_id = null, status = 'ended' where id = p_lobby_id;
  else
    update public.lobbies set host_member_id = v_next where id = p_lobby_id;
  end if;
  return v_next;
end;
$$;

create or replace function public.create_lobby(p_code text, p_name text, p_device_hash text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lobby uuid;
  v_member uuid;
begin
  insert into public.lobbies (code) values (p_code) returning id into v_lobby;
  insert into public.members (lobby_id, name, device_token_hash)
    values (v_lobby, p_name, p_device_hash) returning id into v_member;
  update public.lobbies set host_member_id = v_member where id = v_lobby;
  return jsonb_build_object('lobby_id', v_lobby, 'member_id', v_member, 'name', p_name);
exception when unique_violation then
  return jsonb_build_object('error', 'code_taken');
end;
$$;

-- Joins (or rejoins) a lobby.
--   * Same device as an existing member: that member again (rejoin).
--   * Same name as a member who left, or who has been offline for over
--     p_stale_seconds: rejoin as that member from this device.
--   * Same name as a member who is online: join as "Sam 2".
-- Returns {status: ok, member_id, name, renamed, rejoined} or {status: error}.
create or replace function public.join_lobby(
  p_code text, p_name text, p_device_hash text,
  p_max_members integer default 10, p_stale_seconds integer default 75)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_lobby public.lobbies%rowtype;
  v_member public.members%rowtype;
  v_active integer;
  v_name text;
begin
  select * into v_lobby from public.lobbies
  where code = p_code and status <> 'ended' and expires_at > now()
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- 1. This device is already a member.
  select * into v_member from public.members
  where lobby_id = v_lobby.id and device_token_hash = p_device_hash
  order by joined_at desc limit 1;
  if found then
    if v_member.removed_at is not null then
      return jsonb_build_object('status', 'removed');
    end if;
    if v_member.left_at is not null then
      if v_lobby.status = 'open' then
        select count(*) into v_active from public.members
        where lobby_id = v_lobby.id and removed_at is null and left_at is null;
        if v_active >= p_max_members then
          return jsonb_build_object('status', 'full');
        end if;
      end if;
      update public.members set left_at = null, last_seen_at = now() where id = v_member.id;
      if v_lobby.host_member_id is null then
        perform public.hand_over_host(v_lobby.id);
      end if;
    end if;
    return jsonb_build_object('status', 'ok', 'member_id', v_member.id, 'name', v_member.name,
                              'renamed', false, 'rejoined', true);
  end if;

  -- 2. Someone already has this name.
  select * into v_member from public.members
  where lobby_id = v_lobby.id and lower(name) = lower(p_name);
  if found and v_member.removed_at is null
     and (v_member.left_at is not null
          or v_member.last_seen_at < now() - make_interval(secs => p_stale_seconds)) then
    if v_member.left_at is not null and v_lobby.status = 'open' then
      select count(*) into v_active from public.members
      where lobby_id = v_lobby.id and removed_at is null and left_at is null;
      if v_active >= p_max_members then
        return jsonb_build_object('status', 'full');
      end if;
    end if;
    update public.members
      set device_token_hash = p_device_hash, left_at = null, last_seen_at = now()
      where id = v_member.id;
    if v_lobby.host_member_id is null then
      perform public.hand_over_host(v_lobby.id);
    end if;
    return jsonb_build_object('status', 'ok', 'member_id', v_member.id, 'name', v_member.name,
                              'renamed', false, 'rejoined', true);
  end if;

  -- 3. A new member.
  if v_lobby.status <> 'open' then
    return jsonb_build_object('status', 'locked');
  end if;
  select count(*) into v_active from public.members
  where lobby_id = v_lobby.id and removed_at is null and left_at is null;
  if v_active >= p_max_members then
    return jsonb_build_object('status', 'full');
  end if;

  v_name := public.next_free_name(v_lobby.id, p_name);
  insert into public.members (lobby_id, name, device_token_hash)
    values (v_lobby.id, v_name, p_device_hash)
    returning * into v_member;
  return jsonb_build_object('status', 'ok', 'member_id', v_member.id, 'name', v_name,
                            'renamed', v_name <> p_name, 'rejoined', false);
end;
$$;

-- Checks a code before the name step. Never reveals anything about the lobby
-- beyond whether this device can join it.
create or replace function public.check_lobby_code(p_code text, p_device_hash text, p_max_members integer default 10)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_lobby public.lobbies%rowtype;
  v_mine public.members%rowtype;
  v_active integer;
begin
  select * into v_lobby from public.lobbies
  where code = p_code and status <> 'ended' and expires_at > now();
  if not found then return 'not_found'; end if;

  select * into v_mine from public.members
  where lobby_id = v_lobby.id and device_token_hash = p_device_hash
  order by joined_at desc limit 1;
  if found then
    if v_mine.removed_at is not null then return 'removed'; end if;
    if v_mine.left_at is null then return 'member'; end if;
  end if;

  if v_lobby.status <> 'open' then return 'locked'; end if;
  select count(*) into v_active from public.members
  where lobby_id = v_lobby.id and removed_at is null and left_at is null;
  if v_active >= p_max_members then return 'full'; end if;
  return 'ok';
end;
$$;

create or replace function public.leave_lobby(p_lobby_id uuid, p_member_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_lobby public.lobbies%rowtype;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id for update;
  update public.members set left_at = now()
    where id = p_member_id and lobby_id = p_lobby_id and left_at is null and removed_at is null;
  if v_lobby.host_member_id = p_member_id then
    perform public.hand_over_host(p_lobby_id);
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

create or replace function public.remove_member(p_lobby_id uuid, p_host_member_id uuid, p_target_member_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_lobby public.lobbies%rowtype;
begin
  select * into v_lobby from public.lobbies where id = p_lobby_id for update;
  if v_lobby.host_member_id is distinct from p_host_member_id then
    return jsonb_build_object('status', 'not_host');
  end if;
  if p_target_member_id = p_host_member_id then
    return jsonb_build_object('status', 'cannot_remove_self');
  end if;
  update public.members set removed_at = now()
    where id = p_target_member_id and lobby_id = p_lobby_id and removed_at is null;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- Only the server (service_role, via the secret key) may call these.
do $$
declare f text;
begin
  foreach f in array array[
    'notify_lobby_changed(uuid)', 'on_lobby_row_changed()',
    'rate_limit_hit(text, integer, integer)', 'next_free_name(uuid, text)',
    'hand_over_host(uuid)', 'create_lobby(text, text, text)',
    'join_lobby(text, text, text, integer, integer)', 'check_lobby_code(text, text, integer)',
    'leave_lobby(uuid, uuid)', 'remove_member(uuid, uuid, uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
