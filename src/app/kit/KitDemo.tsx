"use client";

import { useState } from "react";
import {
  Chip,
  ChipRow,
  CodeCard,
  ErrorCard,
  MainButton,
  MemberChip,
  Notice,
  PillButton,
  ShareButton,
  StatusCard,
  Screen,
  WaitingChip,
} from "@/components/ui";
import styles from "./kit.module.css";

const TAGS = ["Pizza", "Sushi", "Tacos", "Burgers", "Thai", "Vegan"];

export function KitDemo() {
  const [selected, setSelected] = useState<string[]>(["Sushi"]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState(false);
  const toggle = (tag: string) =>
    setSelected((s) => (s.includes(tag) ? s.filter((t) => t !== tag) : [...s, tag]));

  return (
    <Screen
      footer={
        <MainButton arrow disabled={!ready} disabledReason="3 of 6 seen" onClick={() => setReady(false)}>
          Go vote
        </MainButton>
      }
    >
      <h1>Design kit</h1>
      <p className={styles.note}>Every piece the screens are built from. Not part of the app flow.</p>

      <section className={styles.section}>
        <h2>Lobby code</h2>
        <CodeCard code="K7MQ4X" />
        <StatusCard action={<ShareButton code="K7MQ4X" />}>The host is setting up the game</StatusCard>
      </section>

      <section className={styles.section}>
        <h2>Members</h2>
        <ChipRow>
          <MemberChip name="Alex" host />
          <MemberChip name="Sam" you />
          <MemberChip name="Jordan" onClick={() => {}} />
          <MemberChip name="Sam 2" offline />
          <WaitingChip />
        </ChipRow>
      </section>

      <section className={styles.section}>
        <h2>Chips and tags</h2>
        <ChipRow>
          {TAGS.map((tag) => (
            <Chip key={tag} selected={selected.includes(tag)} onClick={() => toggle(tag)}>
              {tag}
            </Chip>
          ))}
          <Chip disabled>Picked by no one</Chip>
        </ChipRow>
        <p>Yes / No picks (screen 08) use Pickle green when selected:</p>
        <ChipRow>
          <Chip tone="pickle" selected>
            Italian
          </Chip>
          <Chip tone="pickle">Mexican</Chip>
        </ChipRow>
      </section>

      <section className={styles.section}>
        <h2>Secondary buttons</h2>
        <div className={styles.row}>
          <PillButton onClick={() => setReady((r) => !r)}>
            {ready ? "Lock main button" : "Unlock main button"}
          </PillButton>
          <PillButton disabled>Disabled</PillButton>
        </div>
        <PillButton full>Leave lobby</PillButton>
      </section>

      <section className={styles.section}>
        <h2>Notices and errors</h2>
        <ErrorCard title="Code not found">This code doesn&apos;t exist or has expired. Check it with the host.</ErrorCard>
        <PillButton onClick={() => setNotice((n) => !n)}>{notice ? "Hide notice" : "Show notice"}</PillButton>
        {notice && <Notice title="Alex left. You're now the host." body="The game continues where it left off." />}
      </section>

      <section className={styles.section}>
        <h2>Type</h2>
        <h1>Heading 700</h1>
        <p className={styles.semibold}>Names and buttons 600</p>
        <p>Body text 400</p>
        <p className={styles.note}>Secondary text #555555</p>
      </section>
    </Screen>
  );
}
