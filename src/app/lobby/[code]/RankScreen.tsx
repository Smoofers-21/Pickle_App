"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MainButton, PillButton, Screen, Subtitle, Title } from "@/components/ui";
import { milesLabel } from "@/lib/game/cards";
import { dropIndex, moveItem, ordinal, shiftFor, startingOrder } from "@/lib/game/ranking";
import { post } from "@/lib/client-api";
import type { GameInfo, OptionView } from "@/lib/lobby-types";
import { OptionCard, PlacesAttribution } from "./CardsScreen";
import { gameLabel } from "./gameLabel";
import styles from "./vote.module.css";

/** Holding a row this long (without scrolling) picks it up. */
const HOLD_MS = 250;
/** Moving further than this before the hold ends means the person is scrolling. */
const SCROLL_SLOP_PX = 8;
/** The gap between rows (matches .list in vote.module.css). */
const ROW_GAP_PX = 12;

/** A drag in progress. `slot` is one row's height plus the gap, measured at the start. */
const DRAFT_PREFIX = "pickle:rank:";

/** The order this phone was arranging before a reload, if it still fits. */
function loadDraft(key: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const list: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return Array.isArray(list) && list.every((id) => typeof id === "string") ? list : null;
  } catch {
    return null;
  }
}

/** Remembers the order being arranged; keeps only this vote's draft. */
function saveDraft(key: string, order: string[]) {
  try {
    const store = window.localStorage;
    for (let i = store.length - 1; i >= 0; i--) {
      const k = store.key(i);
      if (k && k.startsWith(DRAFT_PREFIX) && k !== key) store.removeItem(k);
    }
    store.setItem(key, JSON.stringify(order));
  } catch {
    // Storage blocked: the ranking still works, it just isn't kept on reload.
  }
}

function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to clear.
  }
}

type Drag = { from: number; startY: number; dy: number; middles: number[]; slot: number; to: number; pointerId: number };

function Thumb({ option }: { option: OptionView }) {
  return (
    <span className={styles.thumb}>
      {option.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={option.image.src} alt="" referrerPolicy="no-referrer" decoding="async" />
      )}
    </span>
  );
}

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 9h14M5 15h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// Screens 13 (rank this round's options) and 15 (rank the finalists). Hold a
// row, or grab its handle, and drag; the handle also takes arrow keys. The
// list being ordered is outlined in Pickle green.
export function RankScreen({
  code,
  game,
  options,
  saved,
  final,
  demo,
  onGoToChoices,
  onSubmitted,
  notice,
}: {
  code: string;
  game: GameInfo;
  options: OptionView[];
  /** This phone's ranking from before (when changing it), if any. */
  saved: string[] | null;
  final: boolean;
  demo: boolean;
  /** Back to the cards (round votes only). */
  onGoToChoices?: () => void;
  onSubmitted: () => void;
  notice?: React.ReactNode;
}) {
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const draftKey = `${DRAFT_PREFIX}${game.id}:${final ? 0 : game.currentRound}`;
  // A submitted ranking (when changing it) wins, then an unsent draft from before a reload.
  // The order being arranged (kept across a reload) wins over a submitted
  // ranking being changed; the draft is cleared once a ranking is submitted.
  const [order, setOrderState] = useState(() => startingOrder(options.map((o) => o.id), loadDraft(draftKey), saved));
  const setOrder = (next: string[]) => {
    setOrderState(next);
    saveDraft(draftKey, next);
  };
  const [drag, setDrag] = useState<Drag | null>(null);
  const [announce, setAnnounce] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardOf, setCardOf] = useState<OptionView | null>(null);
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const handles = useRef<(HTMLButtonElement | null)[]>([]);
  const hold = useRef<{ timer: number; x: number; y: number; index: number; pointerId: number; moved: boolean } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  // While a row is being dragged, stop the page from scrolling under the finger.
  useEffect(() => {
    if (!drag) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", stop, { passive: false });
    return () => document.removeEventListener("touchmove", stop);
  }, [drag]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (cardOf && !d.open) d.showModal();
    if (!cardOf && d.open) d.close();
  }, [cardOf]);

  function startDrag(index: number, clientY: number, pointerId: number) {
    const rects = rows.current.slice(0, order.length).map((el) => el?.getBoundingClientRect());
    const middles = rects.map((r) => (r ? r.top + r.height / 2 : 0));
    const slot = (rects[index]?.height ?? 0) + ROW_GAP_PX;
    setDrag({ from: index, startY: clientY, dy: 0, middles, slot, to: index, pointerId });
    if (navigator.vibrate) navigator.vibrate(10);
  }

  function moveDrag(clientY: number, pointerId: number) {
    setDrag((d) => {
      if (!d || d.pointerId !== pointerId) return d;
      const dy = clientY - d.startY;
      return { ...d, dy, to: dropIndex(d.middles, d.from, d.middles[d.from] + dy) };
    });
  }

  function endDrag(pointerId: number) {
    if (!drag || drag.pointerId !== pointerId) return;
    if (drag.to !== drag.from) {
      const next = moveItem(order, drag.from, drag.to);
      setOrder(next);
      const name = byId.get(order[drag.from])?.name ?? "Option";
      setAnnounce(`${name} moved to ${ordinal(drag.to + 1)}.`);
    }
    setDrag(null);
  }

  function cancelHold() {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  }

  function moveByKey(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= order.length) return;
    setOrder(moveItem(order, index, to));
    setAnnounce(`${byId.get(order[index])?.name ?? "Option"} moved to ${ordinal(to + 1)}.`);
    // Keep focus on the moved row's handle.
    window.requestAnimationFrame(() => handles.current[to]?.focus());
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await post(`/api/lobbies/${code}/vote`, { round: final ? 0 : game.currentRound, ranking: order });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    clearDraft(draftKey);
    onSubmitted();
  }

  const top = final
    ? `Final vote · top 2 from each round`
    : `${game.roundsTotal > 1 ? `Round ${game.currentRound} of ${game.roundsTotal}` : gameLabel(game)} · Voting`;

  return (
    <Screen
      footer={
        <>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.footerRow}>
            {!final && onGoToChoices && (
              <PillButton full onClick={onGoToChoices} disabled={submitting}>
                Go to choices
              </PillButton>
            )}
            <MainButton onClick={submit} disabled={submitting || drag !== null}>
              {submitting ? "Submitting…" : final ? "Submit final ranking" : "Submit"}
            </MainButton>
          </div>
        </>
      }
    >
      {notice}
      <p className={styles.top}>{top}</p>
      <div className={styles.head}>
        <Title>{final ? "Rank the finalists" : "Rank your choices"}</Title>
        <Subtitle>Put your favorite first: everyone&apos;s ranking counts toward the result. Hold and drag to reorder, or tap one to see its card again.</Subtitle>
      </div>

      <ol className={styles.list} aria-label="Your ranking">
        {order.map((id, i) => {
          const o = byId.get(id);
          if (!o) return null;
          const dragging = drag?.from === i;
          const shift = drag ? shiftFor(i, drag.from, drag.to) : 0;
          const y = dragging ? drag.dy : shift * (drag?.slot ?? 0);
          return (
            <li
              key={id}
              ref={(el) => {
                rows.current[i] = el;
              }}
              className={`${styles.row} ${dragging ? styles.lifted : ""} ${drag ? styles.moving : ""}`}
              style={{ transform: y ? `translateY(${y}px)` : undefined }}
              onPointerDown={(e) => {
                if (e.button !== 0 || drag) return;
                const index = i;
                const pointerId = e.pointerId;
                const target = e.currentTarget;
                cancelHold();
                hold.current = {
                  x: e.clientX,
                  y: e.clientY,
                  index,
                  pointerId,
                  moved: false,
                  timer: window.setTimeout(() => {
                    if (!hold.current || hold.current.moved) return;
                    const startY = hold.current.y;
                    hold.current = null;
                    try {
                      target.setPointerCapture(pointerId);
                    } catch {
                      // The pointer already ended; nothing to capture.
                    }
                    startDrag(index, startY, pointerId);
                  }, HOLD_MS),
                };
              }}
              onPointerMove={(e) => {
                const h = hold.current;
                if (h && h.pointerId === e.pointerId && Math.hypot(e.clientX - h.x, e.clientY - h.y) > SCROLL_SLOP_PX) {
                  h.moved = true;
                  cancelHold();
                }
                if (drag) moveDrag(e.clientY, e.pointerId);
              }}
              onPointerUp={(e) => {
                const h = hold.current;
                // A quick tap (no hold, no drag) shows the option's card.
                if (h && h.pointerId === e.pointerId && !h.moved && !drag) setCardOf(o);
                cancelHold();
                endDrag(e.pointerId);
              }}
              onPointerCancel={(e) => {
                cancelHold();
                if (drag && drag.pointerId === e.pointerId) setDrag(null);
              }}
            >
              <span className={styles.place} aria-hidden="true">
                {i + 1}
              </span>
              <Thumb option={o} />
              <span className={styles.text}>
                {/* Taps open the card through the row; this button gives
                    keyboard and screen-reader users the same (Enter / Space). */}
                <button
                  type="button"
                  className={styles.nameButton}
                  aria-label={`See the card for ${o.name}`}
                  onClick={(e) => {
                    if (e.detail === 0) setCardOf(o);
                  }}
                >
                  <span className={styles.name}>{o.name}</span>
                </button>
                <span className={styles.meta}>
                  {final && o.fromRound ? <span className={styles.roundTag}>R{o.fromRound}</span> : null}
                  {dragging ? "Moving…" : milesLabel(o.distanceMi)}
                </span>
              </span>
              <button
                type="button"
                ref={(el) => {
                  handles.current[i] = el;
                }}
                className={styles.handle}
                aria-label={`${o.name}, ${ordinal(i + 1)} of ${order.length}. Drag, or use the up and down arrow keys, to move it.`}
                onPointerDown={(e) => {
                  if (e.button !== 0 || drag) return;
                  e.stopPropagation();
                  cancelHold();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  startDrag(i, e.clientY, e.pointerId);
                }}
                onPointerMove={(e) => {
                  e.stopPropagation();
                  moveDrag(e.clientY, e.pointerId);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  endDrag(e.pointerId);
                }}
                onPointerCancel={(e) => {
                  e.stopPropagation();
                  if (drag && drag.pointerId === e.pointerId) setDrag(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    moveByKey(i, -1);
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    moveByKey(i, 1);
                  }
                }}
              >
                <GripIcon />
              </button>
            </li>
          );
        })}
      </ol>
      {options.some((o) => o.source === "geoapify") && <PlacesAttribution className={styles.attribution} />}
      <p className={styles.srOnly} aria-live="polite">
        {announce}
      </p>

      <dialog ref={dialog} className={styles.cardDialog} onClose={() => setCardOf(null)} aria-label={cardOf?.name ?? "Option"}>
        {cardOf && <OptionCard option={cardOf} demo={demo} />}
        <div className={styles.cardDialogFooter}>
          <PillButton full onClick={() => setCardOf(null)}>
            Back to ranking
          </PillButton>
        </div>
      </dialog>
    </Screen>
  );
}
