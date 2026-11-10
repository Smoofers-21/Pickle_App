"use client";

import { ChipRow, Hint, Label, PillButton, ProgressBar, Screen, StatusChip, Subtitle, Title } from "@/components/ui";
import type { GameInfo, LobbyMember } from "@/lib/lobby-types";
import styles from "../../flow.module.css";
import { gameLabel } from "./gameLabel";

// Screen 09: who has picked (never what they picked).
export function WaitingScreen({
  game,
  members,
  meId,
  picksDone,
  onChange,
  changing,
  notice,
}: {
  game: GameInfo;
  members: LobbyMember[];
  meId: string;
  picksDone: string[];
  onChange: () => void;
  changing?: boolean;
  notice?: React.ReactNode;
}) {
  const done = new Set(picksDone);
  const doneCount = members.filter((m) => done.has(m.id)).length;
  // Done members first, keeping join order within each group.
  const ordered = [...members].sort((a, b) => Number(done.has(b.id)) - Number(done.has(a.id)));

  return (
    <Screen
      footer={
        <PillButton full onClick={onChange} disabled={changing}>
          {changing ? "Opening your picks…" : "Change my picks"}
        </PillButton>
      }
    >
      {notice}
      <div className={styles.memberHeader}>
        <p className={styles.small}>Picks submitted · {gameLabel(game)}</p>
        <Title>
          {doneCount} of {members.length} picks are in
        </Title>
        <div className={styles.progressBlock}>
          <ProgressBar value={doneCount} max={members.length} label="Picks submitted" />
          <Subtitle>The search starts when everyone has picked.</Subtitle>
        </div>
      </div>

      <div className={styles.sectionHead}>
        <Label>Who&apos;s done</Label>
      </div>
      <ChipRow>
        {ordered.map((m) => (
          <StatusChip key={m.id} name={m.name} done={done.has(m.id)} you={m.id === meId} />
        ))}
      </ChipRow>
      <div className={styles.otherField}>
        <Hint>Only who&apos;s done is shown. Nobody sees what anyone picked.</Hint>
      </div>
    </Screen>
  );
}
