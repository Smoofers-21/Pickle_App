import { describe, expect, it } from "vitest";
import { isLobbyState } from "./lobby-state-check";

const good = {
  status: "ok",
  lobby: { id: "l1", code: "ABCDEF", status: "open", isDemo: false },
  me: { id: "m1", name: "Sam", isHost: true },
  members: [{ id: "m1", name: "Sam", isHost: true, isDemo: false }],
  maxMembers: 10,
  game: { id: "g1", stage: "results", category: "food", eventDate: null, radiusMi: 5, age: "all", indoorOutdoor: "either", roundsTotal: 1, currentRound: 1, search: null },
  picksDone: [],
  myPicks: null,
  demoPending: false,
  options: [{ id: "o1", name: "Bella", kind: "Restaurant", distanceMi: 1, source: "geoapify", place: 1 }],
  votesDone: ["m1"],
  myVote: { ranking: ["o1"], ready: true },
};

describe("isLobbyState", () => {
  it("accepts every kind of good answer", () => {
    expect(isLobbyState(good)).toBe(true);
    expect(isLobbyState({ ...good, game: null, options: [], myVote: null })).toBe(true);
    expect(isLobbyState({ status: "moved", code: "BCDEFG" })).toBe(true);
    expect(isLobbyState({ status: "removed", code: "BCDEFG" })).toBe(true);
    expect(isLobbyState({ status: "not_member" })).toBe(true);
    expect(isLobbyState({ status: "not_found" })).toBe(true);
  });

  it("rejects broken lists and missing fields (Codex's examples)", () => {
    expect(isLobbyState({ ...good, members: [null] })).toBe(false);
    expect(isLobbyState({ status: "ok", members: [], options: [], me: {}, lobby: {} })).toBe(false);
    expect(isLobbyState({ ...good, options: [{ id: "o1" }] })).toBe(false);
    expect(isLobbyState({ ...good, game: { ...good.game, stage: "dancing" } })).toBe(false);
    expect(isLobbyState({ ...good, myVote: { ranking: [1], ready: true } })).toBe(false);
    expect(isLobbyState({ ...good, votesDone: null })).toBe(false);
  });

  it("rejects bad codes and unknown statuses", () => {
    expect(isLobbyState({ status: "moved", code: "../evil" })).toBe(false);
    expect(isLobbyState({ ...good, lobby: { ...good.lobby, code: "AB" } })).toBe(false);
    expect(isLobbyState({ status: "party" })).toBe(false);
    expect(isLobbyState(null)).toBe(false);
    expect(isLobbyState([])).toBe(false);
  });
});
