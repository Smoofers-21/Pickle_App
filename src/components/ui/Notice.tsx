"use client";

import { PersonIcon } from "./icons";
import styles from "./ui.module.css";

/** Black notice at the top of the screen, like "Alex left. You're now the host." (screen 18) */
export function Notice({ title, body, onClose }: { title: string; body?: string; onClose?: () => void }) {
  return (
    <div className={styles.noticeWrap} role="status" aria-live="polite">
      <div className={styles.notice} onClick={onClose}>
        <PersonIcon />
        <div>
          <p className={styles.noticeTitle}>{title}</p>
          {body && <p className={styles.noticeBody}>{body}</p>}
        </div>
      </div>
    </div>
  );
}
