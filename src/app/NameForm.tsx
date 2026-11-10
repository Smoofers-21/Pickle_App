"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  BackButton,
  CodeChip,
  ErrorCard,
  Hint,
  MainButton,
  PillLink,
  Screen,
  Subtitle,
  TextField,
  Title,
} from "@/components/ui";
import { post } from "@/lib/client-api";
import { joinError } from "@/lib/join-messages";
import { cleanName, NAME_MAX } from "@/lib/lobby-rules";
import type { CodeCheck } from "@/lib/lobby-types";
import styles from "./flow.module.css";

type Problem = { title: string; body: string; fatal?: boolean };

/**
 * Screen 03: "What should the group call you?"
 * With a code it joins that lobby; without one it creates a new lobby.
 */
export function NameForm({ code }: { code?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  // Next.js keeps this page alive (hidden) after you leave it. Start fresh
  // each time it's shown again, instead of a stuck "Creating…" button.
  useLayoutEffect(() => {
    return () => {
      setName("");
      setBusy(false);
      setProblem(null);
    };
  }, []);

  // People who open an invite link land here directly, so check the code first.
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    post<{ result: CodeCheck }>(`/api/lobbies/${code}/check`).then((res) => {
      if (cancelled) return;
      if (!res.ok) setProblem({ ...joinError(res.error, res.message), fatal: res.error !== "offline" });
      else if (res.data.result === "member") router.replace(`/lobby/${code}`);
      else if (res.data.result !== "ok") setProblem({ ...joinError(res.data.result, ""), fatal: true });
    });
    return () => {
      cancelled = true;
    };
  }, [code, router]);

  async function submit() {
    const clean = cleanName(name);
    if (!clean) {
      setProblem(joinError("bad_name", ""));
      return;
    }
    setBusy(true);
    setProblem(null);
    if (code) {
      const res = await post<{ name: string; renamed: boolean }>(`/api/lobbies/${code}/join`, { name: clean });
      if (res.ok) {
        router.push(`/lobby/${code}${res.data.renamed ? "?renamed=1" : ""}`);
        return;
      }
      setProblem({ ...joinError(res.error, res.message), fatal: ["not_found", "full", "locked", "removed"].includes(res.error) });
    } else {
      const res = await post<{ code: string }>("/api/lobbies", { name: clean });
      if (res.ok) {
        router.push(`/lobby/${res.data.code}`);
        return;
      }
      setProblem(joinError(res.error, res.message));
    }
    setBusy(false);
  }

  const fatal = problem?.fatal;

  return (
    <Screen
      footer={
        fatal ? (
          <PillLink href="/join" full>
            Enter a different code
          </PillLink>
        ) : (
          <MainButton arrow onClick={submit} disabled={busy || !name.trim()}>
            {busy ? (code ? "Joining…" : "Creating…") : code ? "Join lobby" : "Create lobby"}
          </MainButton>
        )
      }
    >
      <div className={styles.topBar}>
        <BackButton href={code ? "/join" : "/"} />
        {code && <CodeChip code={code} />}
      </div>
      <Title>What should the group call you?</Title>
      <Subtitle>Your name is shown in the lobby. Nothing else is needed.</Subtitle>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (!fatal) submit();
        }}
      >
        <TextField
          id="name"
          label="Your name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!fatal) setProblem(null);
          }}
          maxLength={NAME_MAX}
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="go"
          disabled={fatal}
          autoFocus
        />
        {code && <Hint>Rejoining? Use the same name to keep your progress.</Hint>}
        {problem && <ErrorCard title={problem.title}>{problem.body}</ErrorCard>}
      </form>
    </Screen>
  );
}
