"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
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
  SoftButton,
  StatusCard,
  Subtitle,
  Title,
  WaitingChip,
} from "@/components/ui";
import { cleanCodeInput } from "@/lib/lobby-rules";
import type { LobbyMember } from "@/lib/lobby-types";
import { post } from "@/lib/client-api";
import styles from "../../flow.module.css";
import { NothingFoundScreen } from "./NothingFoundScreen";
import { OptionsListScreen } from "./OptionsListScreen";
import { PicksScreen } from "./PicksScreen";
import { SearchingScreen } from "./SearchingScreen";
import { SetupScreen } from "./SetupScreen";
import { useLobby } from "./useLobby";
import { WaitingScreen } from "./WaitingScreen";

// Screens 05 (host), 06 (member), 07 (setup), 08 (picks), 09 (waiting for
// picks), 10 (searching), 11 (nothing found), 18 (host left notice) and 19
// (removed). After the search, a plain list of the options until milestone 5.
export function LobbyView() {
  const params = useParams<{ code: string }>();
  const code = cleanCodeInput(params.code ?? "");
  const router = useRouter();
  const { state, online, notice, dismissNotice, showNotice, error, leave, remove, refresh } = useLobby(code);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [toRemove, setToRemove] = useState<LobbyMember | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [changingPicks, setChangingPicks] = useState(false);
  const [addingDemo, setAddingDemo] = useState(false);
  const [changingCriteria, setChangingCriteria] = useState(false);

  // Close any open confirm box when leaving this page (Next.js keeps it alive, hidden).
  useLayoutEffect(() => {
    return () => {
      setConfirmLeave(false);
      setToRemove(null);
      setSettingUp(false);
      setChangingCriteria(false);
    };
  }, []);

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

  const { me, members, maxMembers, lobby, game } = state;
  const host = members.find((m) => m.isHost);
  // Demo friends are never "connected", but they count as here.
  const isOffline = (id: string) =>
    id !== me.id && online !== null && !online.has(id) && !members.find((m) => m.id === id)?.isDemo;
  const noticeBar = notice && <Notice key={notice.id} title={notice.title} body={notice.body} onClose={dismissNotice} />;

  // ----- In a game -----
  if (game) {
    if (game.stage === "picks") {
      if (!state.myPicks || !state.myPicks.ready) {
        return (
          <PicksScreen
            key={`${game.id}-${state.myPicks ? "change" : "new"}`}
            code={code}
            game={game}
            initial={state.myPicks}
            onSubmitted={refresh}
          />
        );
      }
      return (
        <WaitingScreen
          game={game}
          members={members}
          meId={me.id}
          picksDone={state.picksDone}
          changing={changingPicks}
          onChange={async () => {
            // Un-ready on the server first, so the search waits for us.
            setChangingPicks(true);
            const res = await post(`/api/lobbies/${code}/picks`, {}, "DELETE");
            setChangingPicks(false);
            if (!res.ok) showNotice({ title: res.message });
            refresh();
          }}
          notice={noticeBar}
        />
      );
    }
    if (game.stage === "searching") {
      const failed = game.search?.status === "nothing_found" || game.search?.status === "unavailable";
      if (failed && me.isHost && changingCriteria) {
        return <SetupScreen code={code} change={game} onBack={() => setChangingCriteria(false)} />;
      }
      if (failed) {
        return (
          <NothingFoundScreen
            code={code}
            game={game}
            isHost={me.isHost}
            hostName={host?.name ?? "the host"}
            onChangeCriteria={() => setChangingCriteria(true)}
            notice={noticeBar}
          />
        );
      }
      return <SearchingScreen game={game} notice={noticeBar} />;
    }
    return <OptionsListScreen game={game} options={state.options} notice={noticeBar} />;
  }

  if (me.isHost && settingUp && lobby.status === "open") {
    return <SetupScreen code={code} onBack={() => setSettingUp(false)} />;
  }

  async function addDemoFriends() {
    setAddingDemo(true);
    const res = await post(`/api/lobbies/${code}/demo`);
    setAddingDemo(false);
    if (!res.ok) showNotice({ title: res.message });
    refresh();
  }
  const hasDemo = members.some((m) => m.isDemo);
  const roomForDemo = members.length + 3 <= maxMembers;

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

  if (me.isHost) {
    return (
      <Screen
        footer={
          <MainButton arrow onClick={() => setSettingUp(true)}>
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
        {!hasDemo && roomForDemo && (
          <div className={styles.otherField}>
            <SoftButton onClick={addDemoFriends} disabled={addingDemo}>
              {addingDemo ? "Adding…" : "Add demo friends"}
            </SoftButton>
          </div>
        )}
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
