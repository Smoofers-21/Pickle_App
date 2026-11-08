// Shapes the server routes send to the phone.

export type LobbyMember = {
  id: string;
  name: string;
  isHost: boolean;
  isDemo: boolean;
};

export type LobbyState =
  | {
      status: "ok";
      lobby: { id: string; code: string; status: "open" | "locked"; isDemo: boolean };
      me: { id: string; name: string; isHost: boolean };
      members: LobbyMember[];
      maxMembers: number;
    }
  | { status: "removed"; code: string }
  | { status: "not_member" }
  | { status: "not_found" };

/** Why a code can't be joined (screen 04). */
export type CodeCheck = "ok" | "member" | "not_found" | "full" | "locked" | "removed";

export type ApiError = { error: string; message: string };
