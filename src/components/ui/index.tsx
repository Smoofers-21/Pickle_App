// The Pickle design kit ("2F" style). Every screen is built from these pieces.
// See Design in docs/product-spec.md and the images in docs/screens/.

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight, ChevronLeft } from "./icons";
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

/** Round outlined back button. */
export function BackButton({ href }: { href: string }) {
  return (
    <Link href={href} className={styles.roundButton} aria-label="Back">
      <ChevronLeft />
    </Link>
  );
}

/** A selectable pill, for tags and options. Selected = solid black. */
export function Chip({ selected, className, ...props }: ButtonProps & { selected?: boolean }) {
  return <button type="button" aria-pressed={!!selected} className={cx(styles.chip, className)} {...props} />;
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
