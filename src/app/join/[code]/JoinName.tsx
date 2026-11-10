"use client";

import { useParams } from "next/navigation";
import { cleanCodeInput } from "@/lib/lobby-rules";
import { NameForm } from "../../NameForm";

// Screen 03: enter your name to join a lobby. Invite links open here.
export function JoinName() {
  const params = useParams<{ code: string }>();
  return <NameForm code={cleanCodeInput(params.code ?? "")} />;
}
