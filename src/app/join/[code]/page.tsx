import { Suspense } from "react";
import { JoinName } from "./JoinName";

// Screen 03: enter your name to join a lobby. Invite links open here.
export default function JoinNamePage() {
  return (
    <Suspense>
      <JoinName />
    </Suspense>
  );
}
