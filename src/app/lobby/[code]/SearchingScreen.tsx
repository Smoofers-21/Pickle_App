"use client";

import { BigSpinner, Checklist, Screen, Subtitle, Title } from "@/components/ui";
import type { GameInfo } from "@/lib/lobby-types";
import styles from "../../flow.module.css";
import { gameLabel, roundLabel } from "./gameLabel";

// Screen 10: everyone has picked. The real search arrives in milestone 4, so
// for now this shows the picks are combined and waits there.
export function SearchingScreen({ game, notice }: { game: GameInfo; notice?: React.ReactNode }) {
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
        <Subtitle>Everyone&apos;s picks are in. The search itself arrives in milestone 4.</Subtitle>
        <Checklist
          items={[
            { label: "Combined everyone's picks", state: "done" },
            { label: `Searching within ${game.radiusMi} mi…`, state: "active" },
            { label: "Preparing cards", state: "todo" },
          ]}
        />
      </div>
    </Screen>
  );
}
