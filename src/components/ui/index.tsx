// The Pickle design kit ("2F" style). Every screen is built from these pieces.
// See Design in docs/product-spec.md and the images in docs/screens/.

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight, CheckIcon, ChevronDown, ChevronLeft, PlusIcon } from "./icons";
import styles from "./ui.module.css";

export { CodeCard, ShareButton } from "./CodeCard";
export { CodeBoxes } from "./CodeBoxes";
export { ConfirmDialog } from "./ConfirmDialog";
export { Notice } from "./Notice";
export * from "./icons";

const cx = (...names: (string | false | undefined | null)[]) => names.filter(Boolean).join(" ");

/** A screen: content on top, with the main button pinned near the bottom. */
export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <main className={styles.screen}>
      <div className={styles.screenBody}>{children}</div>
      {footer && <div className={styles.screenFooter}>{footer}</div>}
    </main>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <h1 className={styles.title}>{children}</h1>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <p className={styles.subtitle}>{children}</p>;
}

/** Small uppercase grey label, like "LOBBY CODE". */
export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return htmlFor ? (
    <label htmlFor={htmlFor} className={styles.label}>
      {children}
    </label>
  ) : (
    <p className={styles.label}>{children}</p>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className={styles.hint}>{children}</p>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * The one black main button on a screen. `arrow` adds the → after the text.
 * When disabled, pass a short `disabledReason` to show under it.
 */
export function MainButton({
  disabledReason,
  arrow,
  className,
  children,
  ...props
}: ButtonProps & { disabledReason?: string; arrow?: boolean }) {
  return (
    <>
      <button type="button" className={cx(styles.mainButton, className)} {...props}>
        {children}
        {arrow && <ArrowRight className={styles.arrow} />}
      </button>
      {props.disabled && disabledReason && <p className={styles.disabledReason}>{disabledReason}</p>}
    </>
  );
}

/** A main button that is a link. */
export function MainLink({ href, children, arrow }: { href: string; children: ReactNode; arrow?: boolean }) {
  return (
    <Link href={href} className={styles.mainButton}>
      {children}
      {arrow && <ArrowRight className={styles.arrow} />}
    </Link>
  );
}

/** Secondary button: white pill with a black outline. */
export function PillButton({ full, className, ...props }: ButtonProps & { full?: boolean }) {
  return <button type="button" className={cx(styles.pillButton, full && styles.full, className)} {...props} />;
}

export function PillLink({ href, children, full }: { href: string; children: ReactNode; full?: boolean }) {
  return (
    <Link href={href} className={cx(styles.pillButton, full && styles.full)}>
      {children}
    </Link>
  );
}

/** Round outlined back button: a link, or a button when given `onClick`. */
export function BackButton({ href, onClick }: { href?: string; onClick?: () => void }) {
  if (onClick || !href) {
    return (
      <button type="button" className={styles.roundButton} aria-label="Back" onClick={onClick}>
        <ChevronLeft />
      </button>
    );
  }
  return (
    <Link href={href} className={styles.roundButton} aria-label="Back">
      <ChevronLeft />
    </Link>
  );
}

/** A selectable pill, for tags and options. Selected = solid black. */
export function Chip({ selected, large, className, ...props }: ButtonProps & { selected?: boolean; large?: boolean }) {
  return <button type="button" aria-pressed={!!selected} className={cx(styles.chip, large && styles.large, className)} {...props} />;
}

/** A pill that only shows a word, like the Food / Bars / Events on the home screen. */
export function StaticChip({ children }: { children: ReactNode }) {
  return <span className={styles.chip}>{children}</span>;
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className={styles.chipRow}>{children}</div>;
}

/** Outlined pill text field with a label above it. */
export function TextField({
  id,
  label,
  ...props
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={styles.field}>
      <Label htmlFor={id}>{label}</Label>
      <input id={id} className={styles.input} {...props} />
    </div>
  );
}

/** Small outlined pill showing a lobby code (screen 03). */
export function CodeChip({ code }: { code: string }) {
  return (
    <span className={styles.codeChip} aria-label={`Lobby ${code}`}>
      {code}
    </span>
  );
}

/**
 * A lobby member: pill with their initial. The host's chip is black, and
 * your own has a thicker outline. Pass `onClick` to make it tappable.
 */
export function MemberChip({
  name,
  host,
  you,
  offline,
  onClick,
}: {
  name: string;
  host?: boolean;
  you?: boolean;
  offline?: boolean;
  onClick?: () => void;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const label = `${name}${you ? " (you)" : ""}${host ? " · Host" : ""}`;
  const className = cx(styles.memberChip, host && styles.host, you && !host && styles.you, offline && styles.offline);
  const content = (
    <>
      <span className={styles.initial} aria-hidden="true">
        {initial}
      </span>
      <span>{label}</span>
      {offline && <span className="sr-only">(offline)</span>}
    </>
  );
  return onClick ? (
    <button type="button" className={className} onClick={onClick} aria-label={`Remove ${name}`}>
      {content}
    </button>
  ) : (
    <span className={className}>{content}</span>
  );
}

/** Dashed chip shown while the lobby has room. */
export function WaitingChip({ children = "Waiting for more…" }: { children?: ReactNode }) {
  return <span className={styles.waitingChip}>{children}</span>;
}

/** Pill card with a spinner, used while waiting for someone (screen 06). */
export function StatusCard({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.statusCard} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.statusText}>{children}</span>
      {action}
    </div>
  );
}

/** Outlined card with a black "!" for a problem (screen 04). */
export function ErrorCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.errorCard} role="alert">
      <span className={styles.errorIcon} aria-hidden="true">
        !
      </span>
      <div>
        <p className={styles.errorTitle}>{title}</p>
        <p className={styles.errorBody}>{children}</p>
      </div>
    </div>
  );
}

/** Bold section heading with an optional small label on the right, like "REQUIRED". */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: string }) {
  return (
    <div className={styles.sectionTitleRow}>
      <h2 className={styles.sectionTitle}>{children}</h2>
      {aside && <span className={styles.label}>{aside}</span>}
    </div>
  );
}

export function Divider() {
  return <hr className={styles.divider} />;
}

/** The dashed "+ Other" chip. */
export function OtherChip({ selected, ...props }: ButtonProps & { selected?: boolean }) {
  return (
    <button type="button" aria-pressed={!!selected} className={cx(styles.chip, styles.large, styles.otherChip)} {...props}>
      + Other
    </button>
  );
}

/** Outlined pill dropdown with a chevron. */
export function SelectField({
  id,
  label,
  children,
  ...props
}: { id: string; label: string; children: ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={styles.field}>
      <Label htmlFor={id}>{label}</Label>
      <div className={styles.selectWrap}>
        <select id={id} className={styles.select} {...props}>
          {children}
        </select>
        <ChevronDown className={styles.selectChevron} />
      </div>
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className={styles.progressFill} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A member who is done (check mark) or still going (dashed). Screen 09. */
export function StatusChip({ name, done, you, pendingText = "picking…" }: { name: string; done: boolean; you?: boolean; pendingText?: string }) {
  return (
    <span className={cx(styles.statusChip, you && done && styles.you, !done && styles.pending)}>
      {done ? (
        <span className={styles.checkCircle} aria-hidden="true">
          <CheckIcon />
        </span>
      ) : (
        <span className={styles.dashedCircle} aria-hidden="true" />
      )}
      <span>
        {name}
        {you && " (you)"}
        {!done && ` · ${pendingText}`}
      </span>
    </span>
  );
}

export type CheckState = "done" | "active" | "todo";

/** Card listing steps that are done, in progress or still to come. Screen 10. */
export function Checklist({ items }: { items: { label: string; state: CheckState }[] }) {
  return (
    <ul className={styles.checklist} style={{ listStyle: "none", margin: 0 }}>
      {items.map((item) => (
        <li key={item.label} className={cx(styles.checkItem, item.state === "active" && styles.active, item.state === "todo" && styles.todo)}>
          {item.state === "done" && (
            <span className={styles.checkCircle} aria-hidden="true">
              <CheckIcon />
            </span>
          )}
          {item.state === "active" && <span className={styles.spinner} aria-hidden="true" />}
          {item.state === "todo" && <span className={styles.todoCircle} aria-hidden="true" />}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function BigSpinner() {
  return <span className={cx(styles.spinner, styles.bigSpinner)} aria-hidden="true" />;
}

/** Soft grey pill with a plus, like "+ Add demo friends". */
export function SoftButton({ children, ...props }: ButtonProps) {
  return (
    <button type="button" className={styles.softButton} {...props}>
      <PlusIcon />
      {children}
    </button>
  );
}
