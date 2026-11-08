"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChipRow,
  CodeCard,
  ConfirmDialog,
  Label,
  MainButton,
  MainLink,
  MemberChip,
  Notice,
  PersonRemovedIcon,
  PillButton,
  PillLink,
  Screen,
  ShareButton,
  StatusCard,
  Subtitle,
  Title,
  WaitingChip,
} from "@/components/ui";
import { cleanCodeInput } from "@/lib/lobby-rules";
import type { LobbyMember } from "@/lib/lobby-types";
import styles from "../../flow.module.css";
import { useLobby } from "./useLobby";

// Screens 05 (host), 06 (member), 18 (host left notice) and 19 (removed).
export function LobbyView() {
  const params = useParams<{ code: string }>();
  const code = cleanCodeInput(params.code ?? "");
  const router = useRouter();
  const { state, online, notice, dismissNotice, error, leave, remove } = useLobby(code);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [toRemove, setToRemove] = useState<LobbyMember | null>(null);

  // Not in this lobby yet: go to the name step.
  useEffect(() => {
    if (state?.status === "not_member") router.replace(`/join/${code}`);
  }, [state, code, router]);

  if (!state || state.status === "not_member") {
    return (
      <Screen>
        <p className={styles.loading}>{error ?? "Loading the lobby…"}</p>
      </Screen>
    );
  }

  if (state.status === "removed") return <Removed code={state.code} />;

  if (state.status === "not_found") {
    return (
      <Screen footer={<MainLink href="/">Back to home</MainLink>}>
        <div className={styles.center}>
          <Title>This lobby has ended</Title>
          <Subtitle>The code {code} is no longer active. Ask the host for a new one.</Subtitle>
        </div>
      </Screen>
    );
  }

  const { me, members, maxMembers, lobby } = state;
  const host = members.find((m) => m.isHost);
  const isOffline = (id: string) => id !== me.id && online !== null && !online.has(id);

  async function doLeave() {
    setConfirmLeave(false);
    await leave();
    router.push("/");
  }

  const chips = (
    <ChipRow>
      {members.map((m) => (
        <MemberChip
          key={m.id}
          name={m.name}
          host={m.isHost}
          you={m.id === me.id}
          offline={isOffline(m.id)}
          onClick={me.isHost && !m.isHost ? () => setToRemove(m) : undefined}
        />
      ))}
      {me.isHost && members.length < maxMembers && <WaitingChip />}
    </ChipRow>
  );

  const dialogs = (
    <>
      <ConfirmDialog
        open={confirmLeave}
        title="Leave this lobby?"
        body={
          me.isHost && members.length > 1
            ? `${members.find((m) => !m.isHost)?.name ?? "The next person"} will become the host.`
            : "You can rejoin with the same code and name."
        }
        confirmLabel="Leave lobby"
        onConfirm={doLeave}
        onCancel={() => setConfirmLeave(false)}
      />
      <ConfirmDialog
        open={toRemove !== null}
        title={`Remove ${toRemove?.name ?? ""}?`}
        body="They'll leave the lobby and can't rejoin it."
        confirmLabel="Remove"
        onConfirm={() => {
          if (toRemove) remove(toRemove.id);
          setToRemove(null);
        }}
        onCancel={() => setToRemove(null)}
      />
    </>
  );

  const noticeBar = notice && <Notice key={notice.id} title={notice.title} body={notice.body} onClose={dismissNotice} />;

  if (me.isHost) {
    return (
      <Screen
        footer={
          <MainButton arrow disabled disabledReason="Game setup arrives in milestone 3">
            Set up the game
          </MainButton>
        }
      >
        {noticeBar}
        <div className={styles.lobbyHeader}>
          <Title>Your lobby</Title>
          <PillButton onClick={() => setConfirmLeave(true)}>Leave</PillButton>
        </div>
        <CodeCard code={lobby.code} />
        <div className={styles.sectionHead}>
          <Label>Who&apos;s here</Label>
          <span className={styles.count}>
            {members.length} of {maxMembers}
            {members.length > 1 && " · tap a name to remove"}
          </span>
        </div>
        {chips}
        <p className={styles.note}>The lobby locks when you start the game.</p>
        {dialogs}
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <PillButton full onClick={() => setConfirmLeave(true)}>
          Leave lobby
        </PillButton>
      }
    >
      {noticeBar}
      <div className={styles.memberHeader}>
        <p className={styles.small}>Lobby {lobby.code}</p>
        <Title>Waiting for {host?.name ?? "the host"} to start</Title>
      </div>
      <StatusCard action={<ShareButton code={lobby.code} />}>The host is setting up the game</StatusCard>
      <div className={styles.sectionHead}>
        <Label>Who&apos;s here</Label>
        <span className={styles.count}>
          {members.length} of {maxMembers}
        </span>
      </div>
      {chips}
      {dialogs}
    </Screen>
  );
}

// Screen 19.
function Removed({ code }: { code: string }) {
  return (
    <Screen
      footer={
        <>
          <MainLink href="/join">Join another lobby</MainLink>
          <PillLink href="/" full>
            Back to home
          </PillLink>
        </>
      }
    >
      <div className={styles.center}>
        <div className={styles.bigIcon}>
          <PersonRemovedIcon />
        </div>
        <Title>You were removed from the lobby</Title>
        <Subtitle>The host removed you from lobby {code}. You can join a different lobby with a new code.</Subtitle>
      </div>
    </Screen>
  );
}
