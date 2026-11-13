// Shapes the server routes send to the phone.

import type { Category } from "./game/tags";

export type LobbyMember = {
  id: string;
  name: string;
  isHost: boolean;
  isDemo: boolean;
};

export type Stage = "picks" | "searching" | "cards_and_voting" | "round_complete" | "final_vote" | "results";

/** The game's criteria. The host's location is never sent to phones. */
export type GameInfo = {
  id: string;
  stage: Stage;
  category: Category;
  eventDate: string | null;
  radiusMi: number;
  age: "all" | "21_plus";
  indoorOutdoor: "either" | "indoor" | "outdoor";
  roundsTotal: number;
  currentRound: number;
  /** The current round's search (screens 10 and 11). Never the host's location. */
  search: SearchInfo | null;
};

export type SearchInfo = {
  status: "running" | "done" | "nothing_found" | "unavailable";
  radiusMi: number;
  /** Options at or above the threshold after the first search. */
  matches: number | null;
  /** The wider radius, once the search widened. */
  widenedTo: number | null;
  /** Why it was unavailable: the daily free-plan limit, or the data source failed. */
  reason: "budget" | "error" | "no_location" | null;
};

/** One option shown this round. Never its score. */
export type OptionView = {
  id: string;
  name: string;
  kind: string;
  distanceMi: number;
  address: string | null;
  link: string | null;
  /** Food and bars: true / false from OpenStreetMap hours, null when unknown. */
  openNow: boolean | null;
  /** A local illustrative cuisine image, or the event's Ticketmaster image. */
  image: { src: string; illustrative: boolean } | null;
  /** Events: venue and local start time. */
  venue: string | null;
  startTime: string | null;
  source: "geoapify" | "ticketmaster";
  /** Final vote: the round this finalist came from. */
  fromRound?: number;
  /** Results only: the place (1 = winner); tied options share one. Points are never sent. */
  place?: number;
};

/** One side of a pick: a preset tag key, or "other" with typed text. */
export type PickSide = { tag: string; other?: string | null };

export type LobbyState =
  | {
      status: "ok";
      lobby: { id: string; code: string; status: "open" | "locked"; isDemo: boolean };
      me: { id: string; name: string; isHost: boolean };
      members: LobbyMember[];
      maxMembers: number;
      game: GameInfo | null;
      /** Members who have submitted picks. Never what they picked. */
      picksDone: string[];
      /**
       * This phone's own picks, so they can be changed. `ready` is false
       * after "Change my picks" until they are submitted again.
       */
      myPicks: { no: PickSide | null; yes: PickSide | null; ready: boolean } | null;
      /** Demo friends are still about to pick: check back soon. */
      demoPending: boolean;
      /**
       * Depends on the stage: the round's options (cards and voting), the
       * round's top 2 (round complete), the finalists (final vote), or every
       * option of the deciding round in order, with places (results).
       */
      options: OptionView[];
      /** Members whose ranking for the open vote is submitted. Never their rankings. */
      votesDone: string[];
      /** This phone's own ranking for the open vote; `ready` is false while changing it. */
      myVote: { ranking: string[]; ready: boolean } | null;
    }
  | { status: "removed"; code: string }
  | { status: "not_member" }
  | { status: "not_found" };

/** Why a code can't be joined (screen 04). */
export type CodeCheck = "ok" | "member" | "not_found" | "full" | "locked" | "removed";

export type ApiError = { error: string; message: string };
