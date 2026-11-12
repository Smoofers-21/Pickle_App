"use client";

import { useState } from "react";
import { MainButton, Screen, Subtitle, Title } from "@/components/ui";
import { milesLabel } from "@/lib/game/cards";
import { ordinal } from "@/lib/game/ranking";
import { post } from "@/lib/client-api";
import type { GameInfo, OptionView } from "@/lib/lobby-types";
import styles from "./vote.module.css";

function OptionRow({ option, children }: { option: OptionView; children?: React.ReactNode }) {
  return (
    <li className={styles.plainRow}>
      <span className={styles.thumb}>
        {option.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={option.image.src} alt="" referrerPolicy="no-referrer" decoding="async" />
        )}
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{option.name}</span>
        <span className={styles.meta}>{[option.venue, milesLabel(option.distanceMi)].filter(Boolean).join(" · ")}</span>
      </span>
      {children}
    </li>
  );
}

// Screen 14: the round's top 2 move on to the final. Points stay hidden
// until the end. The host starts the next round (or the final vote).
export function RoundCompleteScreen({
  code,
  game,
  options,
  isHost,
  hostName,
  onContinued,
  notice,
}: {
  code: string;
  game: GameInfo;
  options: OptionView[];
  isHost: boolean;
  hostName: string;
  onContinued: () => void;
  notice?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = game.currentRound >= game.roundsTotal;
  const finalists = game.roundsTotal * 2;

  async function next() {
    setBusy(true);
    setError(null);
    const res = await post(`/api/lobbies/${code}/continue`);
    setBusy(false);
    if (!res.ok) setError(res.message);
    onContinued();
  }

  return (
    <Screen
      footer={
        isHost ? (
          <>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <p className={styles.waitNote}>Everyone waits here until you continue</p>
            <MainButton arrow onClick={next} disabled={busy}>
              {busy ? "Starting…" : last ? "Start the final vote" : `Start round ${game.currentRound + 1}`}
            </MainButton>
          </>
        ) : (
          <p className={styles.waitNote}>Waiting for {hostName} to continue</p>
        )
      }
    >
      {notice}
      <p className={styles.top}>Round {game.currentRound} complete</p>
      <div className={styles.head}>
        <Title>{options.length === 1 ? "1 option goes" : `${options.length} options go`} to the final</Title>
        <Subtitle>Points stay hidden until the end.</Subtitle>
      </div>
      <p className={styles.label}>Moving on</p>
      <ul className={styles.list}>
        {options.map((o) => (
          <OptionRow key={o.id} option={o} />
        ))}
      </ul>
      <div className={styles.next}>
        <p className={styles.label} style={{ margin: 0 }}>
          Next
        </p>
        <p>
          {last
            ? `Final vote: rank the top ${finalists} from every round.`
            : `Round ${game.currentRound + 1} of ${game.roundsTotal}: same criteria, all-new options.`}
        </p>
      </div>
    </Screen>
  );
}

// The final order with points, until milestone 7's results screen (16)
// adds directions, a web search link and Change lobby.
export function ResultsScreen({ options, notice }: { options: OptionView[]; notice?: React.ReactNode }) {
  const top = options.slice(0, 3);
  return (
    <Screen>
      {notice}
      <p className={styles.top}>Results</p>
      <div className={styles.head}>
        <Title>{top[0] ? `${top[0].name} wins` : "The votes are in"}</Title>
        <Subtitle>Directions and the full results screen arrive in the next update.</Subtitle>
      </div>
      <ol className={styles.list}>
        {top.map((o, i) => (
          <OptionRow key={o.id} option={o}>
            <span className={styles.points}>
              {ordinal(i + 1)} · {o.points ?? 0} pts
            </span>
          </OptionRow>
        ))}
      </ol>
    </Screen>
  );
}
