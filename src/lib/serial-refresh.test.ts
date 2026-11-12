import { describe, expect, it } from "vitest";
import { serialRefresh } from "./serial-refresh";

/** A load whose responses are released by hand, in any order. */
function controlledLoad() {
  const pending: { resolve: (v: string) => void; label: string }[] = [];
  let n = 0;
  const load = () =>
    new Promise<string>((resolve) => {
      n += 1;
      pending.push({ resolve, label: `response ${n}` });
    });
  return { load, pending, calls: () => n };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("serialRefresh", () => {
  it("never applies an older response after a newer one", async () => {
    const { load, pending, calls } = controlledLoad();
    const applied: string[] = [];
    const r = serialRefresh(load, (v) => applied.push(v));

    const first = r.run(); // e.g. a heartbeat (final vote)
    const second = r.run(); // e.g. a ping arrives while it's in flight (results)
    expect(calls()).toBe(1); // the second waits instead of racing

    pending[0].resolve("final_vote");
    await tick();
    expect(calls()).toBe(2); // the trailing reload starts after the first is applied
    pending[1].resolve("results");
    await Promise.all([first, second]);
    expect(applied).toEqual(["final_vote", "results"]);
  });

  it("coalesces many requests during one reload into a single trailing reload", async () => {
    const { load, pending, calls } = controlledLoad();
    const r = serialRefresh(load, () => {});
    r.run();
    r.run();
    r.run();
    r.run();
    pending[0].resolve("a");
    await tick();
    pending[1]?.resolve("b");
    await tick();
    expect(calls()).toBe(2);
  });

  it("applies nothing after stop", async () => {
    const { load, pending } = controlledLoad();
    const applied: string[] = [];
    const r = serialRefresh(load, (v) => applied.push(v));
    const p = r.run();
    r.stop();
    pending[0].resolve("late");
    await p;
    expect(applied).toEqual([]);
    await r.run();
    expect(applied).toEqual([]);
  });
});
