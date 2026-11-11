import "server-only";
import { cuisineImage } from "@/lib/game/cuisine-images";
import type { Candidate } from "@/lib/game/scoring";
import type { GameInfo, LobbyState, OptionView, PickSide, SearchInfo } from "@/lib/lobby-types";
import { isOpenNow } from "@/lib/places/opening-hours";
import { MAX_MEMBERS } from "@/lib/lobby-rules";
import { runDemoPicks } from "./demo";
import { db } from "./supabase";

export type LobbyRow = {
  id: string;
  code: string;
  status: "open" | "locked" | "ended";
  host_member_id: string | null;
  is_demo: boolean;
  current_game_id: string | null;
};
type MemberRow = {
  id: string;
  name: string;
  is_demo: boolean;
  removed_at: string | null;
  left_at: string | null;
};
export type GameRow = {
  id: string;
  stage: GameInfo["stage"];
  category: GameInfo["category"];
  event_date: string | null;
  radius_mi: number;
  age: GameInfo["age"];
  indoor_outdoor: GameInfo["indoorOutdoor"];
  rounds_total: number;
  current_round: number;
  time_zone: string | null;
  search: Record<string, unknown> | null;
};
export type PickRow = {
  member_id: string;
  no_tag: string;
  no_other: string | null;
  yes_tag: string | null;
  yes_other: string | null;
  submitted_at: string;
  ready: boolean;
};

export async function findLobby(code: string): Promise<LobbyRow | null> {
  const { data, error } = await db()
    .from("lobbies")
    .select("id, code, status, host_member_id, is_demo, current_game_id")
    .eq("code", code)
    .neq("status", "ended")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data as LobbyRow | null;
}

/** This device's latest member row in a lobby. */
export async function findMe(lobbyId: string, deviceHash: string): Promise<MemberRow | null> {
  const { data, error } = await db()
    .from("members")
    .select("id, name, is_demo, removed_at, left_at")
    .eq("lobby_id", lobbyId)
    .eq("device_token_hash", deviceHash)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as MemberRow | null;
}

/** The lobby and this device's active member row, or null if they aren't in it. */
export async function findActiveMember(code: string, deviceHash: string) {
  const lobby = await findLobby(code);
  const me = lobby && (await findMe(lobby.id, deviceHash));
  if (!lobby || !me || me.left_at || me.removed_at) return null;
  return { lobby, me };
}

export async function findGame(gameId: string): Promise<GameRow | null> {
  const { data, error } = await db()
    .from("games")
    .select("id, stage, category, event_date, radius_mi, age, indoor_outdoor, rounds_total, current_round, time_zone, search")
    .eq("id", gameId)
    .maybeSingle();
  if (error) throw error;
  return data as GameRow | null;
}

export async function findPicks(gameId: string): Promise<PickRow[]> {
  const { data, error } = await db()
    .from("picks")
    .select("member_id, no_tag, no_other, yes_tag, yes_other, submitted_at, ready")
    .eq("game_id", gameId);
  if (error) throw error;
  return (data ?? []) as PickRow[];
}

const side = (tag: string, other: string | null): PickSide => ({ tag, other });

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The search progress phones may see: status and radius only, never the location. */
export function searchInfo(game: GameRow): SearchInfo | null {
  const s = game.search;
  if (!s || num(s.round) !== game.current_round) return null;
  const status = s.status;
  if (status !== "running" && status !== "done" && status !== "nothing_found" && status !== "unavailable") return null;
  const reason = s.reason === "budget" || s.reason === "error" || s.reason === "no_location" ? s.reason : null;
  return {
    status,
    radiusMi: num(s.radius_mi) ?? Number(game.radius_mi),
    matches: num(s.matches),
    widenedTo: num(s.widened_to),
    reason,
  };
}

/** The options shown in this round, for the cards (milestone 5) and the list in between. */
export async function roundOptions(game: GameRow): Promise<OptionView[]> {
  const { data, error } = await db()
    .from("options")
    .select("id, name, distance_mi, address, link, details, source, score")
    .eq("game_id", game.id)
    .eq("shown_in_round", game.current_round)
    .order("score", { ascending: false });
  if (error) throw error;
  const now = new Date();
  return (data ?? []).map((row) => {
    const c = (row.details ?? {}) as Partial<Candidate>;
    const card = c.card ?? { kind: "" };
    const isEvent = row.source === "ticketmaster";
    const image = isEvent
      ? card.imageUrl
        ? { src: card.imageUrl, illustrative: false }
        : null
      : cuisineImage(card.imageKeys ?? [], game.category === "bars" ? "bars" : "food");
    return {
      id: row.id as string,
      name: row.name as string,
      kind: card.kind || (isEvent ? "Event" : game.category === "bars" ? "Bar" : "Restaurant"),
      distanceMi: Number(row.distance_mi),
      address: (row.address as string | null) ?? null,
      link: (row.link as string | null) ?? null,
      openNow: isEvent ? null : isOpenNow(card.hours, now, game.time_zone),
      image,
      venue: card.venue ?? null,
      startTime: card.startTime ?? null,
      source: row.source as OptionView["source"],
    };
  });
}

/**
 * The lobby as this device should see it. Also records that the member is
 * still here (used to tell a dropped phone from an active one), and lets demo
 * friends make their picks when it's their turn.
 */
export async function lobbyState(code: string, deviceHash: string): Promise<LobbyState> {
  const lobby = await findLobby(code);
  if (!lobby || lobby.status === "ended") return { status: "not_found" };

  const me = await findMe(lobby.id, deviceHash);
  if (!me || me.left_at) return { status: "not_member" };
  if (me.removed_at) return { status: "removed", code: lobby.code };

  const [{ data: rows, error }, game] = await Promise.all([
    db()
      .from("members")
      .select("id, name, is_demo")
      .eq("lobby_id", lobby.id)
      .is("removed_at", null)
      .is("left_at", null)
      .order("joined_at", { ascending: true }),
    lobby.current_game_id ? findGame(lobby.current_game_id) : Promise.resolve(null),
    db().from("members").update({ last_seen_at: new Date().toISOString() }).eq("id", me.id),
  ]);
  if (error) throw error;

  const members = (rows ?? []).map((m) => ({
    id: m.id as string,
    name: m.name as string,
    isDemo: m.is_demo as boolean,
    isHost: m.id === lobby.host_member_id,
  }));

  let picks: PickRow[] = [];
  let demoPending = false;
  let currentGame = game;
  if (game && game.stage === "picks") {
    picks = await findPicks(game.id);
    if (lobby.is_demo) {
      const demo = await runDemoPicks(game, lobby.host_member_id, members, picks);
      demoPending = demo.pending;
      if (demo.changed) {
        [picks, currentGame] = await Promise.all([findPicks(game.id), findGame(game.id)]);
      }
    }
  }
  const mine = picks.find((p) => p.member_id === me.id);
  const options =
    currentGame && currentGame.stage !== "picks" && currentGame.stage !== "searching" ? await roundOptions(currentGame) : [];

  return {
    status: "ok",
    lobby: { id: lobby.id, code: lobby.code, status: lobby.status === "locked" ? "locked" : "open", isDemo: lobby.is_demo },
    me: { id: me.id, name: me.name, isHost: me.id === lobby.host_member_id },
    members,
    maxMembers: MAX_MEMBERS,
    game: currentGame
      ? {
          id: currentGame.id,
          stage: currentGame.stage,
          category: currentGame.category,
          eventDate: currentGame.event_date,
          radiusMi: Number(currentGame.radius_mi),
          age: currentGame.age,
          indoorOutdoor: currentGame.indoor_outdoor,
          roundsTotal: currentGame.rounds_total,
          currentRound: currentGame.current_round,
          search: searchInfo(currentGame),
        }
      : null,
    picksDone: picks.filter((p) => p.ready).map((p) => p.member_id),
    myPicks: mine
      ? {
          no: side(mine.no_tag, mine.no_other),
          yes: mine.yes_tag ? side(mine.yes_tag, mine.yes_other) : null,
          ready: mine.ready,
        }
      : null,
    demoPending,
    options,
  };
}
