"use client";

import { useState } from "react";
import {
  Chip,
  ChipRow,
  Divider,
  ErrorCard,
  MainButton,
  OtherChip,
  Screen,
  SectionTitle,
  Subtitle,
  TextField,
  Title,
} from "@/components/ui";
import { post } from "@/lib/client-api";
import { cleanOther, OTHER_MAX, pickLabels, TAGS } from "@/lib/game/tags";
import type { GameInfo, PickSide } from "@/lib/lobby-types";
import styles from "../../flow.module.css";
import { gameLabel } from "./gameLabel";

type Choice = { tag: string | null; other: string };

const fromSide = (side: PickSide | null | undefined): Choice => ({ tag: side?.tag ?? null, other: side?.other ?? "" });

/** One section: the category's tags plus "+ Other". */
function TagPicker({
  id,
  choice,
  onChange,
  blockedTag,
  tags,
}: {
  id: string;
  choice: Choice;
  onChange: (c: Choice) => void;
  blockedTag: string | null;
  tags: { key: string; label: string }[];
}) {
  return (
    <>
      <ChipRow>
        {tags.map((t) => (
          <Chip
            large
            key={t.key}
            selected={choice.tag === t.key}
            disabled={blockedTag === t.key}
            onClick={() => onChange({ tag: choice.tag === t.key ? null : t.key, other: choice.other })}
          >
            {t.label}
          </Chip>
        ))}
        <OtherChip selected={choice.tag === "other"} onClick={() => onChange({ tag: choice.tag === "other" ? null : "other", other: choice.other })} />
      </ChipRow>
      {choice.tag === "other" && (
        <div className={styles.otherField}>
          <TextField
            id={id}
            label="Type your own"
            value={choice.other}
            maxLength={OTHER_MAX}
            onChange={(e) => onChange({ tag: "other", other: e.target.value })}
            autoFocus
            enterKeyHint="done"
          />
        </div>
      )}
    </>
  );
}

// Screen 08: one required No ("Not my ideal place", or "event" for events)
// and an optional Yes ("I’d like to go"); see pickLabels.
export function PicksScreen({
  code,
  game,
  initial,
  onSubmitted,
}: {
  code: string;
  game: GameInfo;
  initial: { no: PickSide; yes: PickSide | null } | null;
  onSubmitted: () => void;
}) {
  const tags = TAGS[game.category];
  const labels = pickLabels(game.category);
  const [no, setNo] = useState<Choice>(fromSide(initial?.no));
  const [yes, setYes] = useState<Choice>(fromSide(initial?.yes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sideValid = (c: Choice) => c.tag !== null && (c.tag !== "other" || cleanOther(c.other) !== null);
  const noValid = sideValid(no);
  const yesValid = yes.tag === null || sideValid(yes);

  async function submit() {
    setBusy(true);
    setError(null);
    const side = (c: Choice) => (c.tag === "other" ? { tag: "other", other: c.other } : { tag: c.tag });
    const res = await post(`/api/lobbies/${code}/picks`, { no: side(no), yes: yes.tag ? side(yes) : null });
    setBusy(false);
    if (res.ok) onSubmitted();
    else setError(res.message);
  }

  // A tag picked as the No can't also be the Yes, and the other way round.
  const blockForYes = no.tag && no.tag !== "other" ? no.tag : null;
  const blockForNo = yes.tag && yes.tag !== "other" ? yes.tag : null;

  return (
    <Screen
      footer={
        <MainButton
          arrow
          onClick={submit}
          disabled={!noValid || !yesValid || busy}
          disabledReason={busy ? undefined : !noValid ? `Pick one for “${labels.no}”` : !yesValid ? `Type your “${labels.yes}”, or unselect Other` : undefined}
        >
          {busy ? "Sending…" : initial ? "Update picks" : "Submit picks"}
        </MainButton>
      }
    >
      <div className={styles.memberHeader}>
        <p className={styles.small}>{gameLabel(game)}</p>
        <Title>Your picks</Title>
        <Subtitle>
          {initial
            ? "You're not counted as done until you submit again. The search waits for you."
            : "Anonymous. The group only sees the combined pool."}
        </Subtitle>
      </div>

      <SectionTitle aside="Required">{labels.no}</SectionTitle>
      <TagPicker id="no-other" choice={no} onChange={setNo} blockedTag={blockForNo} tags={tags} />

      <Divider />

      <SectionTitle aside="Optional">{labels.yes}</SectionTitle>
      <TagPicker id="yes-other" choice={yes} onChange={setYes} blockedTag={blockForYes} tags={tags} />

      {error && (
        <div className={styles.otherField}>
          <ErrorCard title="Couldn't send your picks">{error}</ErrorCard>
        </div>
      )}
    </Screen>
  );
}
