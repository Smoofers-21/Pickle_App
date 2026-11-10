"use client";

import { useState } from "react";
import {
  BackButton,
  Chip,
  ChipRow,
  ErrorCard,
  Hint,
  Label,
  MainButton,
  Screen,
  SelectField,
  Title,
} from "@/components/ui";
import { post } from "@/lib/client-api";
import { dateLabel, DEFAULT_SETUP, shortDate, EVENT_DAYS_AHEAD, localDate, RADIUS_OPTIONS, ROUND_OPTIONS, type Setup } from "@/lib/game/setup";
import { CATEGORY_LABELS, type Category } from "@/lib/game/tags";
import styles from "../../flow.module.css";

const CATEGORIES: Category[] = ["food", "bars", "events"];

/** Asks the phone for its location (only used to center the search). */
function getLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 5 * 60_000 },
    );
  });
}

// Screen 07: the host sets up the game.
export function SetupScreen({ code, onBack }: { code: string; onBack: () => void }) {
  const today = localDate();
  const [setup, setSetup] = useState<Setup>({ ...DEFAULT_SETUP, eventDate: today });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ title: string; body: string } | null>(null);
  const set = <K extends keyof Setup>(key: K, value: Setup[K]) => setSetup((s) => ({ ...s, [key]: value }));

  async function start() {
    if (!setup.category) return;
    setBusy(true);
    setProblem(null);
    let location: { lat: number; lng: number };
    try {
      location = await getLocation();
    } catch (err) {
      const denied = (err as GeolocationPositionError | undefined)?.code === 1;
      setProblem({
        title: denied ? "Location is off" : "Couldn't find your location",
        body: denied
          ? "Pickle searches near you. Allow location for this site in your browser settings, then try again."
          : "Check that location is turned on, then try again.",
      });
      setBusy(false);
      return;
    }
    const res = await post(`/api/lobbies/${code}/start`, {
      category: setup.category,
      eventDate: setup.category === "events" ? setup.eventDate : null,
      radiusMi: setup.radiusMi,
      age: setup.age,
      indoorOutdoor: setup.indoorOutdoor,
      rounds: setup.rounds,
      ...location,
    });
    if (!res.ok) {
      setProblem({ title: "Couldn't start the game", body: res.message });
      setBusy(false);
    }
    // On success the lobby moves to the picks screen by itself.
  }

  return (
    <Screen
      footer={
        <MainButton arrow onClick={start} disabled={!setup.category || busy} disabledReason={busy ? undefined : "Pick a category to start"}>
          {busy ? "Starting…" : "Start game"}
        </MainButton>
      }
    >
      <div className={styles.topBar}>
        <BackButton onClick={onBack} />
      </div>
      <Title>Set up the game</Title>

      <div className={styles.setupGroups}>
        <div className={styles.group}>
          <Label>Category</Label>
          <ChipRow>
            {CATEGORIES.map((c) => (
              <Chip large key={c} selected={setup.category === c} onClick={() => set("category", c)}>
                {CATEGORY_LABELS[c]}
              </Chip>
            ))}
          </ChipRow>
        </div>

        {setup.category === "events" && (
          <SelectField id="event-date" label="Date (events only)" value={setup.eventDate} onChange={(e) => set("eventDate", e.target.value)}>
            {Array.from({ length: EVENT_DAYS_AHEAD }, (_, i) => {
              const d = localDate(i);
              const label = dateLabel(d, today);
              const long = shortDate(d);
              return (
                <option key={d} value={d}>
                  {label === long ? long : `${label}, ${long}`}
                </option>
              );
            })}
          </SelectField>
        )}

        <div className={styles.group}>
          <Label>Radius from you</Label>
          <ChipRow>
            {RADIUS_OPTIONS.map((r) => (
              <Chip large key={r} selected={setup.radiusMi === r} onClick={() => set("radiusMi", r)}>
                {r} mi
              </Chip>
            ))}
          </ChipRow>
        </div>

        <div className={styles.group}>
          <Label>Age</Label>
          <ChipRow>
            <Chip large selected={setup.age === "all"} onClick={() => set("age", "all")}>
              All ages
            </Chip>
            <Chip large selected={setup.age === "21_plus"} onClick={() => set("age", "21_plus")}>
              21+
            </Chip>
          </ChipRow>
        </div>

        <div className={styles.group}>
          <Label>Indoor / outdoor</Label>
          <ChipRow>
            {(["indoor", "outdoor", "either"] as const).map((v) => (
              <Chip large key={v} selected={setup.indoorOutdoor === v} onClick={() => set("indoorOutdoor", v)}>
                {v[0].toUpperCase() + v.slice(1)}
              </Chip>
            ))}
          </ChipRow>
        </div>

        <div className={styles.group}>
          <Label>Rounds</Label>
          <ChipRow>
            {ROUND_OPTIONS.map((r) => (
              <Chip large key={r} selected={setup.rounds === r} onClick={() => set("rounds", r)} className={styles.roundChip}>
                {r}
              </Chip>
            ))}
          </ChipRow>
          <Hint>With 2 or 3 rounds, each round&apos;s top 2 go to a final vote.</Hint>
        </div>

        {problem && <ErrorCard title={problem.title}>{problem.body}</ErrorCard>}
      </div>
    </Screen>
  );
}
