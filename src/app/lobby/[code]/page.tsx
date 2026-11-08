import { Suspense } from "react";
import { LobbyView } from "./LobbyView";

// Screens 05 (host), 06 (member), 18 (host left notice) and 19 (removed).
export default function LobbyPage() {
  return (
    <Suspense>
      <LobbyView />
    </Suspense>
  );
}
