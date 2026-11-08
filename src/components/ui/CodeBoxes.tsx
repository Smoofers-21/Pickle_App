"use client";

import { useState } from "react";
import { CODE_LENGTH, cleanCodeInput } from "@/lib/lobby-rules";
import styles from "./ui.module.css";

/**
 * Six boxes for the lobby code (screen 02). One invisible input sits on top
 * of the boxes, so typing, pasting and the phone's keyboard all just work.
 */
export function CodeBoxes({
  id,
  value,
  onChange,
  onComplete,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className={styles.codeBoxes}>
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const filled = i < value.length;
        const current = focused && i === Math.min(value.length, CODE_LENGTH - 1) && !(value.length === CODE_LENGTH);
        return (
          <span
            key={i}
            aria-hidden="true"
            className={[styles.codeBox, filled && styles.filled, current && styles.current].filter(Boolean).join(" ")}
          >
            {value[i] ?? ""}
          </span>
        );
      })}
      <input
        id={id}
        className={styles.codeInput}
        value={value}
        onChange={(e) => {
          const code = cleanCodeInput(e.target.value);
          onChange(code);
          if (code.length === CODE_LENGTH) onComplete?.(code);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        autoCorrect="off"
        spellCheck={false}
        maxLength={CODE_LENGTH + 4}
        autoFocus
      />
    </div>
  );
}
