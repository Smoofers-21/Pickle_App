import { dateLabel } from "@/lib/game/setup";
import { CATEGORY_LABELS } from "@/lib/game/tags";
import type { GameInfo } from "@/lib/lobby-types";

/** "Events · Today" or "Food · Within 5 mi", as shown above the screen titles. */
export function gameLabel(game: GameInfo): string {
  const category = CATEGORY_LABELS[game.category];
  return game.category === "events" && game.eventDate
    ? `${category} · ${dateLabel(game.eventDate)}`
    : `${category} · Within ${game.radiusMi} mi`;
}

/** "Round 1 of 2 · " for multi-round games, empty otherwise. */
export function roundLabel(game: GameInfo): string {
  return game.roundsTotal > 1 ? `Round ${game.currentRound} of ${game.roundsTotal} · ` : "";
}
