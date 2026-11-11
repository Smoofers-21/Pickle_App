"use client";

import { Screen, Subtitle, Title } from "@/components/ui";
import type { GameInfo, OptionView } from "@/lib/lobby-types";
import styles from "../../flow.module.css";
import { gameLabel, roundLabel } from "./gameLabel";

const miles = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)} mi`;

/** "Italian · 0.4 mi · Open now" or "Rock · Music · 20:00 · 1.2 mi". */
function meta(o: OptionView): string {
  const parts = [o.kind];
  if (o.startTime) parts.push(o.startTime);
  parts.push(miles(o.distanceMi));
  if (o.openNow === true) parts.push("Open now");
  return parts.join(" · ");
}

// What the search found, until the option cards and voting arrive in
// milestones 5 and 6. Place data carries the Geoapify / OpenStreetMap credit.
export function OptionsListScreen({ game, options, notice, demo = false }: { game: GameInfo; options: OptionView[]; notice?: React.ReactNode; demo?: boolean }) {
  const places = options.some((o) => o.source === "geoapify");
  return (
    <Screen>
      {notice}
      <p className={styles.small}>
        {roundLabel(game)}
        {gameLabel(game)}
      </p>
      <div className={styles.memberHeader}>
        <Title>The group&apos;s {options.length === 1 ? "option" : `${options.length} options`}</Title>
        <Subtitle>{demo ? "Demo: saved sample options, not a live search near you. " : "Best match first. "}Option cards and voting arrive in the next milestones.</Subtitle>
      </div>
      <ul className={styles.optionList}>
        {options.map((o) => (
          <li key={o.id} className={styles.optionItem}>
            <p className={styles.optionName}>
              {o.link ? (
                <a href={o.link} target="_blank" rel="noopener noreferrer nofollow">
                  {o.name}
                </a>
              ) : (
                o.name
              )}
            </p>
            <p className={styles.optionMeta}>{meta(o)}</p>
            {(o.venue || o.address) && <p className={styles.optionMeta}>{[o.venue, o.address].filter(Boolean).join(" · ")}</p>}
          </li>
        ))}
      </ul>
      {places && (
        <p className={styles.attribution}>
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
      )}
    </Screen>
  );
}
