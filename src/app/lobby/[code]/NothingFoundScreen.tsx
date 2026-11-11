"use client";

import { useState } from "react";
import { ErrorCard, MainButton, PillButton, Screen, SearchMinusIcon, StatusCard, Subtitle, Title } from "@/components/ui";
import { post } from "@/lib/client-api";
import { dateLabel, shortDate } from "@/lib/game/setup";
import { CATEGORY_LABELS } from "@/lib/game/tags";
import type { GameInfo } from "@/lib/lobby-types";
import styles from "../../flow.module.css";

const NOUN = { food: "restaurants", bars: "bars", events: "events" } as const;

function explain(game: GameInfo): { title: string; body: string } {
  const search = game.search;
  if (search?.reason === "budget") {
    return {
      title: "Search limit reached",
      body: "Pickle has used today's free searches. Try again later, or end the game for now.",
    };
  }
  if (search?.reason === "error") {
    return {
      title: "Couldn't search right now",
      body: `The ${game.category === "events" ? "events" : "places"} service didn't answer. Try again in a moment.`,
    };
  }
  return {
    title: "Nothing viable found",
    body: search?.widenedTo
      ? `No ${NOUN[game.category]} matched the group's picks, even after widening the search by ${search.widenedTo - search.radiusMi} mi.`
      : `No ${NOUN[game.category]} matched the group's picks.`,
  };
}

// Screen 11: the search found nothing. The host changes the criteria or ends
// the game; everyone else waits for the host.
export function NothingFoundScreen({
  code,
  game,
  isHost,
  hostName,
  onChangeCriteria,
  notice,
}: {
  code: string;
  game: GameInfo;
  isHost: boolean;
  hostName: string;
  onChangeCriteria: () => void;
  notice?: React.ReactNode;
}) {
  const [ending, setEnding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { title, body } = explain(game);
  const roundText = game.roundsTotal > 1 ? `Round ${game.currentRound} of ${game.roundsTotal}` : "";

  if (!isHost) {
    return (
      <Screen>
        {notice}
        <p className={styles.small}>{roundText}</p>
        <div className={styles.memberHeader}>
          <Title>{title}</Title>
          <Subtitle>{body}</Subtitle>
        </div>
        <StatusCard>Waiting for {hostName} to change the criteria</StatusCard>
      </Screen>
    );
  }

  async function endGame() {
    setEnding(true);
    setProblem(null);
    const res = await post(`/api/lobbies/${code}/end`);
    if (!res.ok) {
      setProblem(res.message);
      setEnding(false);
    }
    // On success everyone goes back to the lobby by itself.
  }

  const search = game.search;
  const radius =
    search?.widenedTo != null ? `${search.radiusMi} mi → ${search.widenedTo} mi` : `${search?.radiusMi ?? game.radiusMi} mi`;

  return (
    <Screen
      footer={
        <>
          <MainButton onClick={onChangeCriteria} disabled={ending}>
            {search?.reason === "error" ? "Try again" : "Change criteria"}
          </MainButton>
          <PillButton full onClick={endGame} disabled={ending}>
            {ending ? "Ending…" : "End game"}
          </PillButton>
        </>
      }
    >
      {notice}
      <div className={styles.headRow}>
        <p className={styles.small}>{roundText}</p>
        <span className={styles.hostTag}>Host only</span>
      </div>
      <div className={styles.memberHeader}>
        <div className={styles.bigIcon}>
          <SearchMinusIcon />
        </div>
        <Title>{title}</Title>
        <Subtitle>{body}</Subtitle>
      </div>
      <dl className={styles.summary}>
        <div>
          <dt>Category</dt>
          <dd>{CATEGORY_LABELS[game.category]}</dd>
        </div>
        {game.category === "events" && game.eventDate && (
          <div>
            <dt>Date</dt>
            <dd>
              {dateLabel(game.eventDate) === shortDate(game.eventDate)
                ? shortDate(game.eventDate)
                : `${dateLabel(game.eventDate)}, ${shortDate(game.eventDate)}`}
            </dd>
          </div>
        )}
        <div>
          <dt>Radius</dt>
          <dd>{radius}</dd>
        </div>
        <div>
          <dt>Age</dt>
          <dd>{game.age === "21_plus" ? "21+" : "All ages"}</dd>
        </div>
      </dl>
      {problem && <ErrorCard title="Couldn't end the game">{problem}</ErrorCard>}
      <p className={styles.note}>Members see &quot;Waiting for the host&quot; until you choose.</p>
    </Screen>
  );
}
