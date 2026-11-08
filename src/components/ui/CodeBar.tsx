"use client";

import { useState } from "react";
import styles from "./ui.module.css";

/** Lobby code in an outlined pill, with round copy and share buttons. */
export function CodeBar({ code, shareUrl }: { code: string; shareUrl?: string }) {
  const [notice, setNotice] = useState("");

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 2000);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      flash("Code copied");
    } catch {
      flash("Couldn't copy. Select the code instead.");
    }
  }

  async function share() {
    const url = shareUrl ?? window.location.origin;
    const text = `Join my Pickle lobby with code ${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Pickle", text, url });
      } catch {
        // The person closed the share sheet; nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text}: ${url}`);
      flash("Invite link copied");
    } catch {
      flash("Couldn't share. Copy the code instead.");
    }
  }

  return (
    <div>
      <div className={styles.codeBar}>
        <span className={styles.code} aria-label={`Lobby code ${code.split("").join(" ")}`}>
          {code}
        </span>
        <button type="button" className={styles.roundButton} onClick={copy} aria-label="Copy code">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
          </svg>
        </button>
        <button type="button" className={styles.roundButton} onClick={share} aria-label="Share invite">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12" />
            <path d="m7 8 5-5 5 5" />
            <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
          </svg>
        </button>
      </div>
      <p className={styles.copied} role="status" aria-live="polite">
        {notice}
      </p>
    </div>
  );
}
