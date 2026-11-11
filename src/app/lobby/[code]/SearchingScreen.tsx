"use client";

import { BigSpinner, Checklist, Screen, Subtitle, Title, type CheckState } from "@/components/ui";
import type { GameInfo } from "@/lib/lobby-types";
import styles from "../../flow.module.css";
import { gameLabel, roundLabel } from "./gameLabel";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "es"}`;

// Screen 10: the search runs on the server; every phone shows its progress.
export function SearchingScreen({ game, notice }: { game: GameInfo; notice?: React.ReactNode }) {
  const search = game.search;
  const searched = search?.matches != null;
  const widening = search?.widenedTo != null;

  const items: { label: string; state: CheckState }[] = [{ label: "Combined everyone's picks", state: "done" }];
  items.push(
    searched
      ? { label: `Searched within ${search.radiusMi} mi: ${plural(search.matches ?? 0, "match")}`, state: "done" }
      : { label: `Searching within ${game.radiusMi} mi…`, state: "active" },
  );
  if (widening) items.push({ label: `Widening to ${search.widenedTo} mi…`, state: "active" });
  items.push({ label: "Preparing cards", state: searched && !widening ? "active" : "todo" });

  return (
    <Screen>
      {notice}
      <p className={styles.small}>
        {roundLabel(game)}
        {gameLabel(game)}
      </p>
      <div className={styles.searching}>
        <BigSpinner />
        <Title>
          Finding options
          <br />
          for the group
        </Title>
        <Subtitle>Usually takes a few seconds.</Subtitle>
        <Checklist items={items} />
      </div>
    </Screen>
  );
}
