// Checks a lobby state from the server before a screen draws it, so a
// broken or contract-breaking answer shows an error instead of crashing the
// page. A light check of the fields the screens read, not a full schema.

import { isValidCode } from "./lobby-rules";
import type { LobbyState } from "./lobby-types";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === "string" && v.length > 0;
const bool = (v: unknown) => typeof v === "boolean";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const listOf = (v: unknown, ok: (item: unknown) => boolean) => Array.isArray(v) && v.every(ok);

const STAGES = ["picks", "searching", "cards_and_voting", "round_complete", "final_vote", "results"];

function isMember(m: unknown): boolean {
  return isObj(m) && str(m.id) && str(m.name) && bool(m.isHost) && bool(m.isDemo);
}

function isOption(o: unknown): boolean {
  return isObj(o) && str(o.id) && str(o.name) && num(o.distanceMi) && (o.source === "geoapify" || o.source === "ticketmaster");
}

function isGame(g: unknown): boolean {
  return (
    isObj(g) &&
    str(g.id) &&
    STAGES.includes(g.stage as string) &&
    str(g.category) &&
    num(g.roundsTotal) &&
    num(g.currentRound) &&
    num(g.radiusMi) &&
    (g.search === null || isObj(g.search))
  );
}

export function isLobbyState(s: unknown): s is LobbyState {
  if (!isObj(s)) return false;
  switch (s.status) {
    case "ok": {
      const { lobby, me, game, myPicks, myVote } = s;
      return (
        isObj(lobby) &&
        str(lobby.id) &&
        isValidCode(lobby.code) &&
        (lobby.status === "open" || lobby.status === "locked") &&
        isObj(me) &&
        str(me.id) &&
        str(me.name) &&
        bool(me.isHost) &&
        listOf(s.members, isMember) &&
        num(s.maxMembers) &&
        (game === null || isGame(game)) &&
        listOf(s.picksDone, str) &&
        (myPicks === null || (isObj(myPicks) && bool(myPicks.ready))) &&
        bool(s.demoPending) &&
        listOf(s.options, isOption) &&
        listOf(s.votesDone, str) &&
        (myVote === null || (isObj(myVote) && listOf(myVote.ranking, str) && bool(myVote.ready)))
      );
    }
    case "removed":
    case "moved":
      return isValidCode(s.code);
    case "not_member":
    case "not_found":
      return true;
    default:
      return false;
  }
}
