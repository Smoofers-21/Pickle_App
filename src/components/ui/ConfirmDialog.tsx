"use client";

import { useEffect, useRef } from "react";
import styles from "./ui.module.css";

/** A small confirm box, for removing a member or leaving the lobby. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className={styles.dialog} onCancel={onCancel} onClose={onCancel}>
      <p className={styles.dialogTitle}>{title}</p>
      {body && <p className={styles.dialogBody}>{body}</p>}
      <div className={styles.dialogActions}>
        <button type="button" className={styles.mainButton} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className={`${styles.pillButton} ${styles.full}`} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
