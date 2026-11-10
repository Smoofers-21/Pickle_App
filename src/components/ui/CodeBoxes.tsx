"use client";

import { useEffect, useRef, useState } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the boxes whenever the screen is shown (also when Next.js shows a
  // kept-alive page again, where autoFocus doesn't fire).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // The real input is invisible, so keep its cursor at the end: typing adds
  // to the code and Backspace removes the last character.
  const caretToEnd = () => {
    const input = inputRef.current;
    if (input) input.setSelectionRange(input.value.length, input.value.length);
  };

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
        ref={inputRef}
        onKeyDown={(e) => {
          if (e.key === "Backspace") {
            e.preventDefault();
            onChange(value.slice(0, -1));
          }
        }}
        onSelect={caretToEnd}
        onClick={caretToEnd}
        onFocus={() => {
          setFocused(true);
          caretToEnd();
        }}
        onBlur={() => setFocused(false)}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        autoCorrect="off"
        spellCheck={false}
        maxLength={CODE_LENGTH + 4}
      />
    </div>
  );
}
