"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ClockIcon, ExternalIcon, MainButton, PillButton, PinIcon, Screen, StaticChip, Subtitle, Title } from "@/components/ui";
import { cardLink, kindChips, milesLabel, parseSeen, SEEN_PREFIX, seenStorageKey, swipeDirection, timeLabel, voteGate } from "@/lib/game/cards";
import type { GameInfo, OptionView } from "@/lib/lobby-types";
import styles from "./cards.module.css";
import { gameLabel } from "./gameLabel";

function loadSeen(key: string, ids: readonly string[]): Set<string> {
  if (typeof window === "undefined") return new Set(ids.slice(0, 1));
  try {
    return parseSeen(window.localStorage.getItem(key), ids);
  } catch {
    return new Set(ids.slice(0, 1));
  }
}

function saveSeen(key: string, seen: Set<string>) {
  try {
    const store = window.localStorage;
    // Keep only this round's entry, so finished games don't pile up.
    for (let i = store.length - 1; i >= 0; i--) {
      const k = store.key(i);
      if (k && k.startsWith(SEEN_PREFIX) && k !== key) store.removeItem(k);
    }
    store.setItem(key, JSON.stringify([...seen]));
  } catch {
    // Private mode or blocked storage: the cards still work, just not remembered.
  }
}

/** Geoapify and OpenStreetMap credit, required wherever place data is shown. */
export function PlacesAttribution({ className }: { className?: string }) {
  return (
    <p className={className ?? styles.attribution}>
      Powered by{" "}
      <a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">
        Geoapify
      </a>{" "}
      · ©{" "}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
        OpenStreetMap
      </a>{" "}
      contributors
    </p>
  );
}

function OptionCard({ option, demo }: { option: OptionView; demo: boolean }) {
  const link = cardLink(option);
  const start = timeLabel(option.startTime);
  const chips = kindChips(option.kind);
  return (
    <article className={styles.card} aria-label={option.name}>
      <div className={styles.photo}>
        {option.image && (
          // Local cuisine photos and Ticketmaster's own event image; no image
          // is ever fetched from a places API.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={option.image.src} alt="" className={styles.photoImg} referrerPolicy="no-referrer" decoding="async" />
        )}
        {option.image?.illustrative && <span className={styles.photoTag}>Illustrative photo</span>}
        {demo && <span className={`${styles.photoTag} ${styles.photoTagRight}`}>Sample</span>}
      </div>
      <div className={styles.body}>
        <h2 className={styles.name}>{option.name}</h2>
        {option.venue && <p className={styles.venue}>{option.venue}</p>}
        {chips.length > 0 && (
          <div className={styles.chips}>
            {chips.map((c) => (
              <StaticChip key={c}>{c}</StaticChip>
            ))}
          </div>
        )}
        <ul className={styles.facts}>
          <li>
            <PinIcon className={styles.factIcon} />
            <span>
              {milesLabel(option.distanceMi)}
              {option.address && <span className={styles.address}> · {option.address}</span>}
            </span>
          </li>
          {(start || option.openNow === true) && (
            <li>
              <ClockIcon className={styles.factIcon} />
              <span>{start ? `Starts ${start}` : "Open now"}</span>
            </li>
          )}
        </ul>
        {link && (
          <a className={styles.link} href={link.href} target="_blank" rel="noopener noreferrer nofollow">
            {link.label}
            <ExternalIcon className={styles.linkIcon} />
          </a>
        )}
        {option.source === "geoapify" && <PlacesAttribution />}
      </div>
    </article>
  );
}

/** Placeholder for the ranking screen (13), which arrives in milestone 6. */
function VoteComingSoon({ game, onBack }: { game: GameInfo; onBack: () => void }) {
  return (
    <Screen footer={<PillButton full onClick={onBack}>Go to choices</PillButton>}>
      <p className={styles.small}>{gameLabel(game)}</p>
      <div className={styles.comingSoon}>
        <Title>Ranking is next</Title>
        <Subtitle>You&apos;ve seen every option. Dragging them into order arrives in the next update.</Subtitle>
      </div>
    </Screen>
  );
}

type CardsProps = {
  game: GameInfo;
  options: OptionView[];
  notice?: React.ReactNode;
  demo?: boolean;
};

// Screen 12: one option card at a time. Arrows and swipes only move between
// cards (they never record a like); Go vote unlocks once every card is seen.
// A new round (or a different set of options) starts a fresh deck.
export function CardsScreen(props: CardsProps) {
  const key = seenStorageKey(props.game.id, props.game.currentRound);
  return <CardDeck key={`${key}:${props.options.map((o) => o.id).join(",")}`} storageKey={key} {...props} />;
}

function CardDeck({
  game,
  options,
  notice,
  demo = false,
  storageKey: key,
}: CardsProps & { storageKey: string }) {
  const total = options.length;
  const ids = useMemo(() => options.map((o) => o.id), [options]);
  const [index, setIndex] = useState(0);
  // Restores what this phone already saw this round (after a reload).
  const [seen, setSeen] = useState<Set<string>>(() => loadSeen(key, ids));
  const [voting, setVoting] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback(
    (to: number) => {
      const id = ids[to];
      if (id === undefined) return;
      setIndex(to);
      setSeen((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev).add(id);
        saveSeen(key, next);
        return next;
      });
    },
    [ids, key],
  );

  // Start loading the next card's image now, so swiping shows it at once.
  const nextImage = options[index + 1]?.image?.src;
  useEffect(() => {
    if (!nextImage) return;
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.src = nextImage;
  }, [nextImage]);

  useEffect(() => {
    if (voting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, voting]);

  if (voting) return <VoteComingSoon game={game} onBack={() => setVoting(false)} />;

  if (total === 0) {
    return (
      <Screen>
        {notice}
        <p className={styles.small}>{gameLabel(game)}</p>
        <div className={styles.comingSoon}>
          <Title>No options this round</Title>
          <Subtitle>Waiting for the host. This screen updates by itself.</Subtitle>
        </div>
      </Screen>
    );
  }

  const gate = voteGate(seen, ids);
  const option = options[Math.min(index, total - 1)];
  const round = game.roundsTotal > 1 ? `Round ${game.currentRound} of ${game.roundsTotal}` : gameLabel(game);

  return (
    <Screen
      footer={
        <div className={styles.nav}>
          <button type="button" className={styles.navButton} aria-label="Previous option" disabled={index === 0} onClick={() => go(index - 1)}>
            <ChevronLeft />
          </button>
          <MainButton
            disabled={!gate.unlocked}
            onClick={() => setVoting(true)}
            className={`${styles.voteButton} ${gate.share > 0.2 ? styles.voteDark : ""}`}
            style={{ "--vote-mix": `${Math.round(gate.share * 100)}%` } as React.CSSProperties}
          >
            {gate.label}
          </MainButton>
          <button
            type="button"
            className={`${styles.navButton} ${styles.navNext}`}
            aria-label="Next option"
            disabled={index >= total - 1}
            onClick={() => go(index + 1)}
          >
            <ChevronRight />
          </button>
        </div>
      }
    >
      {notice}
      <div className={styles.header}>
        <p className={styles.round}>{round}</p>
        <p className={styles.position} aria-live="polite">
          Option {index + 1} of {total}
        </p>
      </div>
      <div className={styles.progress} aria-hidden="true">
        {options.map((o) => (
          <span key={o.id} className={seen.has(o.id) ? styles.barSeen : styles.bar} />
        ))}
      </div>
      <div
        className={styles.swipeArea}
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          touchStart.current = null;
          const end = e.changedTouches[0];
          if (!start || !end) return;
          const step = swipeDirection(end.clientX - start.x, end.clientY - start.y);
          if (step !== 0) go(index + step);
        }}
      >
        {option && <OptionCard key={option.id} option={option} demo={demo} />}
      </div>
    </Screen>
  );
}
