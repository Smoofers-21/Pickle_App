import type { Metadata } from "next";
import { NameForm } from "../NameForm";

export const metadata: Metadata = {
  title: "Try Pickle",
  description: "Play a group vote with 3 simulated friends. No sign-up or location needed.",
};

// The shareable demo link: type a name, and you host a lobby that already
// has 3 demo friends. Demo lobbies use saved samples, never the live APIs.
export default function DemoPage() {
  return <NameForm demo />;
}
