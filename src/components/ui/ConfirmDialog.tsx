"use client";

import { useEffect, useId, useRef } from "react";
import styles from "./ui.module.css";

/** A small confirm box, for removing a member or leaving the lobby. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  pending = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  pending?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const errorId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={[body && bodyId, error && errorId].filter(Boolean).join(" ") || undefined}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      onClose={() => {
        if (!pending) onCancel();
      }}
    >
      <p id={titleId} className={styles.dialogTitle}>{title}</p>
      {body && <p id={bodyId} className={styles.dialogBody}>{body}</p>}
      {error && <p id={errorId} className={styles.dialogBody} role="alert">{error}</p>}
      <div className={styles.dialogActions}>
        <button type="button" className={styles.mainButton} disabled={pending} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className={`${styles.pillButton} ${styles.full}`} disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
