import { describe, expect, it } from "vitest";
import { dropIndex, initialOrder, moveItem, ordinal, shiftFor, startingOrder } from "./ranking";

describe("moveItem", () => {
  it("moves down and up", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("leaves the list alone for a no-op or bad index, and clamps", () => {
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b", "c"], 0, 9)).toEqual(["b", "c", "a"]);
  });
});

describe("initialOrder", () => {
  const ids = ["a", "b", "c"];
  it("restores a saved ranking of the same options", () => {
    expect(initialOrder(ids, ["c", "a", "b"])).toEqual(["c", "a", "b"]);
  });

  it("falls back to the options' order when the saved one doesn't match", () => {
    expect(initialOrder(ids, null)).toEqual(ids);
    expect(initialOrder(ids, ["a", "b"])).toEqual(ids);
    expect(initialOrder(ids, ["a", "a", "b"])).toEqual(ids);
    expect(initialOrder(ids, ["a", "b", "z"])).toEqual(ids);
  });
});

describe("dragging", () => {
  // Rows 80px apart, middles at 40, 120, 200, 280.
  const middles = [40, 120, 200, 280];
  it("finds where a dragged row lands", () => {
    expect(dropIndex(middles, 0, 40)).toBe(0);
    expect(dropIndex(middles, 0, 130)).toBe(1);
    expect(dropIndex(middles, 0, 300)).toBe(3);
    expect(dropIndex(middles, 3, 10)).toBe(0);
  });

  it("shifts the rows in between", () => {
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 0, 2))).toEqual([0, -1, -1, 0]);
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 3, 1))).toEqual([0, 1, 1, 0]);
    expect([0, 1, 2].map((i) => shiftFor(i, 1, 1))).toEqual([0, 0, 0]);
  });
});

describe("ordinal", () => {
  it("names places", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd"]);
  });
});

describe("startingOrder", () => {
  const ids = ["a", "b", "c"];
  it("prefers the draft being edited over the submitted ranking", () => {
    expect(startingOrder(ids, ["b", "c", "a"], ["c", "a", "b"])).toEqual(["b", "c", "a"]);
  });

  it("uses the submitted ranking when there is no valid draft, then the default", () => {
    expect(startingOrder(ids, null, ["c", "a", "b"])).toEqual(["c", "a", "b"]);
    expect(startingOrder(ids, ["a", "z", "b"], ["c", "a", "b"])).toEqual(["c", "a", "b"]);
    expect(startingOrder(ids, null, null)).toEqual(ids);
  });
});
