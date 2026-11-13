"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { post } from "@/lib/client-api";
import { serialRefresh, type SerialRefresh } from "@/lib/serial-refresh";
import type { LobbyState } from "@/lib/lobby-types";
import { realtimeClient } from "@/lib/realtime";

export type NoticeText = { id: number; title: string; body?: string };

const HEARTBEAT_MS = 30_000;
/**
 * At most one ping-triggered reload every 2 seconds. Anyone who learns the
 * lobby's channel could send fake "changed" pings; without a cap, a flood
 * would make every phone reload until it hit its own rate limit.
 */
const PING_MIN_GAP_MS = 2_000;
const PING_DEBOUNCE_MS = 150;

/** Enough of a lobby state to draw a screen from, so a broken answer can't crash the page. */
function looksLikeState(s: unknown): s is LobbyState {
  if (!s || typeof s !== "object") return false;
  const v = s as Record<string, unknown>;
  if (v.status === "ok") return Array.isArray(v.members) && Array.isArray(v.options) && !!v.me && !!v.lobby;
  if (v.status === "removed" || v.status === "moved") return typeof v.code === "string";
  return v.status === "not_member" || v.status === "not_found";
}

/** Works out what changed between two lobby states, for the black notice. */
function describeChange(prev: LobbyState, next: LobbyState): Omit<NoticeText, "id"> | null {
  if (prev.status !== "ok" || next.status !== "ok") return null;
  const prevHost = prev.members.find((m) => m.isHost);
  const nextHost = next.members.find((m) => m.isHost);
  if (prevHost && nextHost && prevHost.id !== nextHost.id) {
    const stillHere = next.members.some((m) => m.id === prevHost.id);
    const what = stillHere ? `${prevHost.name} is no longer the host.` : `${prevHost.name} left.`;
    return nextHost.id === next.me.id
      ? { title: `${what} You're now the host.`, body: "The game continues where it left off." }
      : { title: `${what} ${nextHost.name} is now the host.` };
  }
  const prevIds = new Set(prev.members.map((m) => m.id));
  const nextIds = new Set(next.members.map((m) => m.id));
  const joined = next.members.filter((m) => !prevIds.has(m.id) && m.id !== next.me.id);
  const left = prev.members.filter((m) => !nextIds.has(m.id));
  if (joined.length === 1 && left.length === 0) return { title: `${joined[0].name} joined` };
  if (left.length === 1 && joined.length === 0) return { title: `${left[0].name} left the lobby` };
  return null;
}

/**
 * Keeps this phone's view of the lobby up to date: loads it from the server,
 * reloads whenever a "changed" ping arrives, and checks in every 30 seconds.
 */
export function useLobby(code: string) {
  const [state, setState] = useState<LobbyState | null>(null);
  const [online, setOnline] = useState<Set<string> | null>(null);
  const [notice, setNotice] = useState<NoticeText | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<LobbyState | null>(null);
  const noticeId = useRef(0);

  const showNotice = useCallback((n: Omit<NoticeText, "id">) => {
    noticeId.current += 1;
    setNotice({ ...n, id: noticeId.current });
  }, []);

  const lastRefreshAt = useRef(0);
  const refresher = useRef<SerialRefresh | null>(null);

  // Reloads run one at a time (heartbeat, pings, coming back online or to
  // the tab can overlap), so an older response can't replace a newer one.
  // A new one is made per lobby code and stopped when the page leaves it.
  useEffect(() => {
    const r = serialRefresh(
      () => {
        lastRefreshAt.current = Date.now();
        return post<LobbyState>(`/api/lobbies/${code}/state`);
      },
      (res) => {
        if (!res.ok) {
          setError(res.message);
          return;
        }
        if (!looksLikeState(res.data)) {
          setError("Something went wrong. Try again.");
          return;
        }
        setError(null);
        const prev = stateRef.current;
        if (prev) {
          const change = describeChange(prev, res.data);
          if (change) showNotice(change);
        }
        stateRef.current = res.data;
        setState(res.data);
      },
    );
    refresher.current = r;
    return () => {
      r.stop();
      if (refresher.current === r) refresher.current = null;
    };
  }, [code, showNotice]);

  // Depends on the code so the effects below restart (and load) for a new lobby.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => refresher.current?.run() ?? Promise.resolve(), [code]);

  // First load, heartbeat, and reload when the phone comes back.
  useEffect(() => {
    const first = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, HEARTBEAT_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
    };
  }, [refresh]);

  // Live pings and online status.
  const lobbyId = state?.status === "ok" ? state.lobby.id : null;
  const myId = state?.status === "ok" ? state.me.id : null;
  useEffect(() => {
    const supabase = realtimeClient();
    if (!supabase || !lobbyId || !myId) return;

    let timer: number | undefined;
    const channel = supabase.channel(`lobby:${lobbyId}`, { config: { presence: { key: myId } } });
    channel
      .on("broadcast", { event: "changed" }, () => {
        // One reload is already scheduled: it will pick up this change too.
        if (timer !== undefined) return;
        const sinceLast = Date.now() - lastRefreshAt.current;
        const wait = Math.max(PING_DEBOUNCE_MS, PING_MIN_GAP_MS - sinceLast);
        timer = window.setTimeout(() => {
          timer = undefined;
          refresh();
        }, wait);
      })
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track({ at: Date.now() });
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setOnline(null);
      });

    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [lobbyId, myId, refresh]);

  // While demo friends are about to pick, check back every couple of seconds.
  const demoPending = state?.status === "ok" && state.demoPending;
  useEffect(() => {
    if (!demoPending) return;
    const t = window.setInterval(refresh, 1500);
    return () => window.clearInterval(t);
  }, [demoPending, refresh]);

  // "Sam was taken, so you're Sam 2" after joining.
  useEffect(() => {
    if (state?.status !== "ok") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("renamed") === "1") {
      showNotice({ title: `You joined as ${state.me.name}`, body: "Someone here already uses that name." });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [state, showNotice]);

  // Hide the notice after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(t);
  }, [notice]);

  const leave = useCallback(async () => {
    const res = await post(`/api/lobbies/${code}/leave`);
    return res.ok;
  }, [code]);

  const remove = useCallback(
    async (memberId: string) => {
      const res = await post(`/api/lobbies/${code}/remove`, { memberId });
      if (!res.ok) showNotice({ title: res.message });
      await refresh();
    },
    [code, refresh, showNotice],
  );

  return { state, online, notice, dismissNotice: () => setNotice(null), showNotice, error, leave, remove, refresh };
}
