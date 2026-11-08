// The Pickle design kit ("2F" style). Every screen is built from these pieces.
// See Design in docs/product-spec.md.

import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./ui.module.css";

export { CodeBar } from "./CodeBar";

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/** A screen: content on top, with the main button pinned near the bottom. */
export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <main className={styles.screen}>
      <div className={styles.screenBody}>{children}</div>
      {footer && <div className={styles.screenFooter}>{footer}</div>}
    </main>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * The one black main button on a screen. When disabled, pass a short
 * `disabledReason` (for example "3 of 6 seen") to show under it.
 */
export function MainButton({
  disabledReason,
  className,
  ...props
}: ButtonProps & { disabledReason?: string }) {
  return (
    <>
      <button type="button" className={cx(styles.mainButton, className)} {...props} />
      {props.disabled && disabledReason && <p className={styles.disabledReason}>{disabledReason}</p>}
    </>
  );
}

/** Secondary button: white pill with a black outline. */
export function PillButton({ full, className, ...props }: ButtonProps & { full?: boolean }) {
  return <button type="button" className={cx(styles.pillButton, full && styles.full, className)} {...props} />;
}

/** A selectable pill, for tags and options. Selected = solid black. */
export function Chip({ selected, className, ...props }: ButtonProps & { selected?: boolean }) {
  return <button type="button" aria-pressed={!!selected} className={cx(styles.chip, className)} {...props} />;
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className={styles.chipRow}>{children}</div>;
}

/** A lobby member: pill with their initial. The host's chip is black. */
export function MemberChip({
  name,
  host,
  you,
  offline,
  onRemove,
}: {
  name: string;
  host?: boolean;
  you?: boolean;
  offline?: boolean;
  onRemove?: () => void;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const tag = [host && "host", you && "you"].filter(Boolean).join(", ");
  return (
    <span className={cx(styles.memberChip, host && styles.host, offline && styles.offline)}>
      <span className={styles.initial} aria-hidden="true">
        {initial}
      </span>
      <span>{name}</span>
      {tag && <span className={styles.memberTag}>({tag})</span>}
      {onRemove && (
        <button type="button" className={styles.memberRemove} onClick={onRemove} aria-label={`Remove ${name}`}>
          ✕
        </button>
      )}
    </span>
  );
}
