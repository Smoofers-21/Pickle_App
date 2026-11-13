"use client";

import { useState } from "react";
import { CopyIcon, ShareIcon } from "./icons";
import styles from "./ui.module.css";

export function inviteUrl(code: string): string {
  return `${window.location.origin}/join/${code}`;
}

async function shareInvite(code: string, onCopied: (text: string) => void) {
  const url = inviteUrl(code);
  const text = `Join my Pickle lobby with code ${code}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Pickle", text, url });
    } catch {
      // The person closed the share sheet.
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text}: ${url}`);
    onCopied("Invite link copied");
  } catch {
    onCopied("Couldn't share. Copy the code instead.");
  }
}

/** Round black share button. */
export function ShareButton({ code, onMessage }: { code: string; onMessage?: (text: string) => void }) {
  return (
    <button
      type="button"
      className={`${styles.roundButton} ${styles.black}`}
      onClick={() => shareInvite(code, onMessage ?? (() => {}))}
      aria-label="Share invite"
    >
      <ShareIcon />
    </button>
  );
}

/** The lobby code with a grey copy button and a black share button (screens 05 and 17). */
export function CodeCard({ code, label = "Code" }: { code: string; label?: string }) {
  const [message, setMessage] = useState("");

  function flash(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2000);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      flash("Code copied");
    } catch {
      flash("Couldn't copy. Select the code instead.");
    }
  }

  return (
    <div>
      <div className={styles.codeCard}>
        <div className={styles.codeCardText}>
          <span className={styles.label}>{label}</span>
          <span className={styles.code} aria-label={`Lobby code ${code.split("").join(" ")}`}>
            {code}
          </span>
        </div>
        <button type="button" className={`${styles.roundButton} ${styles.grey}`} onClick={copy} aria-label="Copy code">
          <CopyIcon />
        </button>
        <ShareButton code={code} onMessage={flash} />
      </div>
      <p className={styles.copied} role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}
