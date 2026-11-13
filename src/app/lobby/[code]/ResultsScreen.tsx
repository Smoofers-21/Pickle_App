"use client";

import { useSyncExternalStore } from "react";
import { NavigateIcon, Screen, SearchIcon, Title } from "@/components/ui";
import { milesLabel, timeLabel } from "@/lib/game/cards";
import { ordinal } from "@/lib/game/ranking";
import { directionsUrl, isAppleMobile, resultsLayout, webSearchUrl } from "@/lib/game/results";
import type { OptionView } from "@/lib/lobby-types";
import { PlacesAttribution } from "./CardsScreen";
import styles from "./results.module.css";

const noSubscribe = () => () => {};

/** True on iPhone and iPad, after hydration (the server can't know). */
function useAppleMaps(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => isAppleMobile(navigator.userAgent, navigator.maxTouchPoints),
    () => false,
  );
}

/** "Venue · 2.1 mi · Starts 7:00 PM" */
function metaLine(o: OptionView): string {
  const start = timeLabel(o.startTime);
  return [o.venue, milesLabel(o.distanceMi), start && `Starts ${start}`].filter(Boolean).join(" · ");
}

/** "Bella Pasta and Sushi Zen tie for 1st" */
function tieTitle(winners: OptionView[]): string {
  const names = winners.map((o) => o.name);
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} tie for 1st`;
}

const external = { target: "_blank", rel: "noopener noreferrer nofollow" } as const;

function WinnerCard({ option, apple, demo }: { option: OptionView; apple: boolean; demo: boolean }) {
  const directions = directionsUrl(option, apple);
  return (
    <article className={styles.winner} aria-label={`1st: ${option.name}`}>
      <div className={styles.photo}>
        {option.image && (
          // Local cuisine photos and Ticketmaster's own event image only.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={option.image.src} alt="" referrerPolicy="no-referrer" decoding="async" />
        )}
        <span className={styles.placeBadge}>1st</span>
        {option.image?.illustrative && <span className={styles.photoTag}>Illustrative photo</span>}
        {demo && <span className={`${styles.photoTag} ${styles.photoTagRight}`}>Sample</span>}
      </div>
      <div className={styles.body}>
        <h2 className={styles.name}>{option.name}</h2>
        <p className={styles.meta}>{metaLine(option)}</p>
        <div className={styles.actions}>
          {directions && (
            <a className={styles.directions} href={directions} {...external}>
              <NavigateIcon />
              Directions
            </a>
          )}
          <a className={styles.search} href={webSearchUrl(option)} {...external}>
            <SearchIcon />
            Search web
          </a>
        </div>
      </div>
    </article>
  );
}

function RankedRow({ option, apple }: { option: OptionView; apple: boolean }) {
  const directions = directionsUrl(option, apple);
  return (
    <li className={styles.row}>
      <span className={styles.placePill}>{option.place ? ordinal(option.place) : ""}</span>
      <span className={styles.text}>
        <span className={styles.rowName}>{option.name}</span>
        <span className={styles.rowMeta}>{metaLine(option)}</span>
      </span>
      {directions && (
        <a className={styles.roundLink} href={directions} aria-label={`Directions to ${option.name}`} {...external}>
          <NavigateIcon />
        </a>
      )}
      <a className={styles.roundLink} href={webSearchUrl(option)} aria-label={`Search the web for ${option.name}`} {...external}>
        <SearchIcon />
      </a>
    </li>
  );
}

// Screen 16: the top 3, ties sharing a place (1st, 1st, 3rd), never points.
// The host's Change lobby button sits in the frame's top-right corner.
export function ResultsScreen({
  options,
  demo,
  footer,
  notice,
}: {
  options: OptionView[];
  demo: boolean;
  footer?: React.ReactNode;
  notice?: React.ReactNode;
}) {
  const apple = useAppleMaps();
  const { winners, others } = resultsLayout(options);
  const shown = [...winners, ...others];
  const title = winners.length > 1 ? tieTitle(winners) : winners.length === 1 ? "The group picked" : "The votes are in";
  return (
    <Screen footer={footer}>
      {notice}
      <p className={styles.top}>Results</p>
      <div className={styles.head}>
        <Title>{title}</Title>
      </div>
      <div className={styles.winners}>
        {winners.map((o) => (
          <WinnerCard key={o.id} option={o} apple={apple} demo={demo} />
        ))}
      </div>
      {others.length > 0 && (
        <>
          <p className={styles.label}>Also ranked</p>
          <ol className={styles.list}>
            {others.map((o) => (
              <RankedRow key={o.id} option={o} apple={apple} />
            ))}
          </ol>
        </>
      )}
      <p className={styles.note}>Ties share a place, for example 1st, 1st, 3rd.</p>
      {shown.some((o) => o.source === "geoapify") && <PlacesAttribution className={styles.attribution} />}
    </Screen>
  );
}
