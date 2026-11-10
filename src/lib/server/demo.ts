import "server-only";
import { randomInt } from "node:crypto";
import { TAGS } from "@/lib/game/tags";
import type { LobbyMember } from "@/lib/lobby-types";
import type { GameRow, PickRow } from "./lobby";
import { db } from "./supabase";

// Demo mode (see "Demo mode" in docs/product-spec.md): the host adds 3
// simulated friends, who make their picks a few seconds after the host does,
// so one person can show the whole flow on one phone.

export const DEMO_NAMES = ["Maya", "Jordan", "Sam"];

/** Seconds after the host picks before each demo friend picks (staggered). */
const FIRST_DELAY_S = 2;
const STAGGER_S = 2;

/**
 * Lets demo friends pick when their time comes. Called whenever a phone asks
 * for the lobby; `pending` tells the phone to check back soon.
 */
export async function runDemoPicks(
  game: GameRow,
  hostId: string | null,
  members: LobbyMember[],
  picks: PickRow[],
): Promise<{ pending: boolean; changed: boolean }> {
  const demo = members.filter((m) => m.isDemo);
  const waiting = demo.filter((m) => !picks.some((p) => p.member_id === m.id));
  if (waiting.length === 0) return { pending: false, changed: false };

  const hostPick = picks.find((p) => p.member_id === hostId);
  if (!hostPick) return { pending: false, changed: false }; // they wait for the host

  const since = (Date.now() - new Date(hostPick.submitted_at).getTime()) / 1000;
  let picked = 0;
  for (const m of waiting) {
    const delay = FIRST_DELAY_S + STAGGER_S * demo.indexOf(m);
    if (since < delay) continue;
    const tags = TAGS[game.category];
    const no = tags[randomInt(tags.length)].key;
    const yesOptions = tags.filter((t) => t.key !== no);
    const yes = randomInt(10) < 7 ? yesOptions[randomInt(yesOptions.length)].key : null;
    const { error } = await db().rpc("submit_picks", {
      p_game_id: game.id,
      p_member_id: m.id,
      p_no_tag: no,
      p_no_other: null,
      p_yes_tag: yes,
      p_yes_other: null,
    });
    if (error) throw error;
    picked += 1;
  }
  return { pending: picked < waiting.length, changed: picked > 0 };
}
