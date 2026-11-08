"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

  async function submit(value = code) {
    if (value.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    const res = await post<{ result: CodeCheck }>(`/api/lobbies/${value}/check`);
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
