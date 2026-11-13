"use client";

import { ChipRow, Hint, Label, PillButton, ProgressBar, Screen, StatusChip, Subtitle, Title } from "@/components/ui";
import type { GameInfo, LobbyMember } from "@/lib/lobby-types";
import styles from "../../flow.module.css";
import { gameLabel, roundLabel } from "./gameLabel";

const COPY = {
  picks: {
    top: "Picks submitted",
    noun: "picks are in",
    progress: "Picks submitted",
    next: "The search starts when everyone has picked.",
    change: "Change my picks",
    opening: "Opening your picks…",
    pending: "picking…",
    hint: "Only who's done is shown. Nobody sees what anyone picked.",
  },
  votes: {
    top: "Ranking submitted",
    noun: "rankings are in",
    progress: "Rankings submitted",
    next: "The round ends when everyone has ranked the options.",
    change: "Change my ranking",
    opening: "Opening your ranking…",
    pending: "ranking…",
    hint: "Only who's done is shown. Nobody sees anyone's ranking.",
  },
  final: {
    top: "Final ranking submitted",
    noun: "final rankings are in",
    progress: "Final rankings submitted",
    next: "The results appear when everyone has ranked the finalists.",
    change: "Change my ranking",
    opening: "Opening your ranking…",
    pending: "ranking…",
    hint: "Only who's done is shown. Nobody sees anyone's ranking.",
  },
};

// Screen 09: who has picked (never what they picked). Also used while
// waiting for everyone's ranking (rounds and the final vote).
export function WaitingScreen({
  game,
  members,
  meId,
  picksDone,
  onChange,
  changing,
  notice,
  kind = "picks",
  onRemove,
  isOffline,
}: {
  game: GameInfo;
  members: LobbyMember[];
  meId: string;
  /** Members who are done (picks or rankings). */
  picksDone: string[];
  onChange: () => void;
  changing?: boolean;
  notice?: React.ReactNode;
  kind?: keyof typeof COPY;
  /** Host only: remove someone who isn't done (stuck or disconnected). */
  onRemove?: (member: LobbyMember) => void;
  /** Whether a member's phone has dropped off (shown as "offline"). */
  isOffline?: (id: string) => boolean;
}) {
  const copy = COPY[kind];
  const done = new Set(picksDone);
  const doneCount = members.filter((m) => done.has(m.id)).length;
  // Done members first, keeping join order within each group.
  const ordered = [...members].sort((a, b) => Number(done.has(b.id)) - Number(done.has(a.id)));

  return (
    <Screen
      footer={
        <PillButton full onClick={onChange} disabled={changing}>
          {changing ? copy.opening : copy.change}
        </PillButton>
      }
    >
      {notice}
      <div className={styles.memberHeader}>
        <p className={styles.small}>
          {copy.top} · {roundLabel(game)}
          {gameLabel(game)}
        </p>
        <Title>
          {doneCount} of {members.length} {copy.noun}
        </Title>
        <div className={styles.progressBlock}>
          <ProgressBar value={doneCount} max={members.length} label={copy.progress} />
          <Subtitle>{copy.next}</Subtitle>
        </div>
      </div>

      <div className={styles.sectionHead}>
        <Label>Who&apos;s done</Label>
      </div>
      <ChipRow>
        {ordered.map((m) => (
          <StatusChip
            key={m.id}
            name={m.name}
            done={done.has(m.id)}
            you={m.id === meId}
            pendingText={isOffline?.(m.id) ? "offline" : copy.pending}
            onClick={onRemove && !done.has(m.id) && m.id !== meId ? () => onRemove(m) : undefined}
            label={`Remove ${m.name}, who isn't done yet`}
          />
        ))}
      </ChipRow>
      <div className={styles.otherField}>
        <Hint>{copy.hint}</Hint>
        {onRemove && members.some((m) => !done.has(m.id) && m.id !== meId) && (
          <Hint>Someone stuck or offline? Tap their name to remove them so the group can finish.</Hint>
        )}
      </div>
    </Screen>
  );
}
