"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { BackButton, CodeBoxes, ErrorCard, Label, MainButton, Screen, Subtitle, Title } from "@/components/ui";
import { post } from "@/lib/client-api";
import { joinError } from "@/lib/join-messages";
import { CODE_LENGTH } from "@/lib/lobby-rules";
import type { CodeCheck } from "@/lib/lobby-types";
import styles from "../flow.module.css";

// Screen 02: enter the lobby code.
export default function JoinCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);
  // One check at a time (the button, Enter and typing the last box can all fire).
  const inFlight = useRef(false);
  // Which showing of this page a check belongs to.
  const visit = useRef(0);

  // Next.js keeps this page alive (hidden) after you leave it. Start fresh
  // each time it's shown again, instead of restoring the old code or a stuck
  // "Checking…" button, and ignore answers to checks from an earlier showing:
  // a slow check must not pull you into a lobby after you tapped Back.
  useLayoutEffect(() => {
    visit.current += 1;
    return () => {
      visit.current += 1;
      inFlight.current = false;
      setCode("");
      setBusy(false);
      setError(null);
    };
  }, []);

  async function submit(value = code) {
    if (value.length !== CODE_LENGTH || inFlight.current) return;
    inFlight.current = true;
    const thisVisit = visit.current;
    setBusy(true);
    setError(null);
    const res = await post<{ result: CodeCheck }>(`/api/lobbies/${value}/check`);
    if (visit.current !== thisVisit) return;
    if (!res.ok) {
      setError(joinError(res.error, res.message));
    } else if (res.data.result === "ok") {
      router.push(`/join/${value}`);
      return;
    } else if (res.data.result === "member") {
      router.push(`/lobby/${value}`);
      return;
    } else {
      setError(joinError(res.data.result, ""));
    }
    inFlight.current = false;
    setBusy(false);
  }

  return (
    <Screen
      footer={
        <MainButton arrow onClick={() => submit()} disabled={code.length !== CODE_LENGTH || busy}>
          {busy ? "Checking…" : "Continue"}
        </MainButton>
      }
    >
      <div className={styles.topBar}>
        <BackButton href="/" />
      </div>
      <Title>Enter the lobby code</Title>
      <Subtitle>Ask the host for the 6-character code.</Subtitle>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Label htmlFor="code">Lobby code</Label>
        <CodeBoxes
          id="code"
          value={code}
          onChange={(v) => {
            setCode(v);
            setError(null);
          }}
          onComplete={submit}
        />
        {error && (
          <ErrorCard title={error.title}>{error.body}</ErrorCard>
        )}
      </form>
    </Screen>
  );
}
