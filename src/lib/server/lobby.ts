import "server-only";
import type { LobbyState } from "@/lib/lobby-types";
import { MAX_MEMBERS } from "@/lib/lobby-rules";
import { db } from "./supabase";

type LobbyRow = { id: string; code: string; status: "open" | "locked" | "ended"; host_member_id: string | null; is_demo: boolean };
type MemberRow = {
  id: string;
  name: string;
  is_demo: boolean;
  removed_at: string | null;
  left_at: string | null;
};

export async function findLobby(code: string): Promise<LobbyRow | null> {
  const { data, error } = await db()
    .from("lobbies")
    .select("id, code, status, host_member_id, is_demo")
    .eq("code", code)
    .neq("status", "ended")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data as LobbyRow | null;
}

/** This device's latest member row in a lobby. */
export async function findMe(lobbyId: string, deviceHash: string): Promise<MemberRow | null> {
  const { data, error } = await db()
    .from("members")
    .select("id, name, is_demo, removed_at, left_at")
    .eq("lobby_id", lobbyId)
    .eq("device_token_hash", deviceHash)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as MemberRow | null;
}

/**
 * The lobby as this device should see it. Also records that the member is
 * still here (used to tell a dropped phone from an active one).
 */
export async function lobbyState(code: string, deviceHash: string): Promise<LobbyState> {
  const lobby = await findLobby(code);
  if (!lobby || lobby.status === "ended") return { status: "not_found" };

  const me = await findMe(lobby.id, deviceHash);
  if (!me || me.left_at) return { status: "not_member" };
  if (me.removed_at) return { status: "removed", code: lobby.code };

  const [{ data: rows, error }] = await Promise.all([
    db()
      .from("members")
      .select("id, name, is_demo")
      .eq("lobby_id", lobby.id)
      .is("removed_at", null)
      .is("left_at", null)
      .order("joined_at", { ascending: true }),
    db().from("members").update({ last_seen_at: new Date().toISOString() }).eq("id", me.id),
  ]);
  if (error) throw error;

  const members = (rows ?? []).map((m) => ({
    id: m.id as string,
    name: m.name as string,
    isDemo: m.is_demo as boolean,
    isHost: m.id === lobby.host_member_id,
  }));

  return {
    status: "ok",
    lobby: { id: lobby.id, code: lobby.code, status: lobby.status, isDemo: lobby.is_demo },
    me: { id: me.id, name: me.name, isHost: me.id === lobby.host_member_id },
    members,
    maxMembers: MAX_MEMBERS,
  };
}
