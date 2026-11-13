// Runs a reload one at a time, so responses can never be applied out of
// order (an older, slower response would otherwise undo a newer one).
// A reload asked for while one is running is not dropped: one more runs
// right after, and its callers wait for that one. Used by useLobby.

export type SerialRefresh = {
  /** Reload now, or right after the current reload. Resolves once a reload that started after this call has been applied. */
  run: () => Promise<void>;
  /** Stop: nothing more is loaded or applied (the page or lobby changed). */
  stop: () => void;
};

export function serialRefresh<T>(load: () => Promise<T>, apply: (value: T) => void): SerialRefresh {
  let current: Promise<void> | null = null;
  let again = false;
  let stopped = false;

  async function loop() {
    do {
      again = false;
      const value = await load();
      if (stopped) return;
      apply(value);
    } while (again && !stopped);
  }

  return {
    run() {
      if (stopped) return Promise.resolve();
      if (current) {
        again = true;
        return current;
      }
      current = loop().finally(() => {
        current = null;
      });
      return current;
    },
    stop() {
      stopped = true;
    },
  };
}
