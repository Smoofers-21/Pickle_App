"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChipRow,
  CodeCard,
  ConfirmDialog,
  InfoCard,
  Label,
  MainButton,
  MainLink,
  MemberChip,
  Notice,
  PersonRemovedIcon,
  PillButton,
  PillLink,
  RefreshIcon,
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
import { CardsScreen } from "./CardsScreen";
import { NothingFoundScreen } from "./NothingFoundScreen";
import { PicksScreen } from "./PicksScreen";
import { RankScreen } from "./RankScreen";
import { ResultsScreen } from "./ResultsScreen";
import { RoundCompleteScreen } from "./RoundCompleteScreen";
import { SearchingScreen } from "./SearchingScreen";
import { SetupScreen } from "./SetupScreen";
import { useLobby } from "./useLobby";
import { WaitingScreen } from "./WaitingScreen";

// Screens 05 (host), 06 (member), 07 (setup), 08 (picks), 09 (waiting for
// picks), 10 (searching), 11 (nothing found), 12 (cards), 13 (rank), 14
// (round complete), 15 (final vote), 16 (results), 17 (new lobby after
// Change lobby), 18 (host left notice) and 19 (removed). Every active-member
// screen shares the top-right Leave lobby button and its confirm dialog; on
// the results screen the host also has Change lobby.
export function LobbyView() {
  const params = useParams<{ code: string }>();
  const code = cleanCodeInput(params.code ?? "");
  const router = useRouter();
  // Arrived here by Change lobby (screen 17).
  const moved = useSearchParams().get("moved") === "1";
  const { state, online, notice, dismissNotice, showNotice, error, leave, remove, refresh } = useLobby(code);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const leavingRef = useRef(false);
  const leaveIntent = useRef(false);
  const leaveFinished = useRef(false);
  const visit = useRef(0);
  const [toRemove, setToRemove] = useState<LobbyMember | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [changingPicks, setChangingPicks] = useState(false);
  const [changingVote, setChangingVote] = useState(false);
  const [addingDemo, setAddingDemo] = useState(false);
  const [changingCriteria, setChangingCriteria] = useState(false);
  const [confirmChange, setConfirmChange] = useState(false);
  const [changingLobby, setChangingLobby] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);
  const changingRef = useRef(false);

  // Activity can hide this page without destroying it. Invalidate any pending
  // leave so its late response cannot redirect a different visit or lobby.
  useLayoutEffect(() => {
    visit.current += 1;
    return () => {
      visit.current += 1;
      leavingRef.current = false;
      leaveIntent.current = false;
      leaveFinished.current = false;
      setLeaving(false);
      setLeaveError(null);
      setConfirmLeave(false);
      setToRemove(null);
      setSettingUp(false);
      setChangingCriteria(false);
      changingRef.current = false;
      setConfirmChange(false);
      setChangingLobby(false);
      setChangeError(null);
    };
  }, [code]);

  // The POST response and an authenticated membership refresh can confirm the
  // same leave. Complete it once, and ignore responses from an older visit.
  const finishLeaving = useCallback((currentVisit: number) => {
    if (visit.current !== currentVisit || leaveFinished.current) return;
    leaveFinished.current = true;
    leavingRef.current = true;
    setLeaving(true);
    setLeaveError(null);
    setConfirmLeave(false);
    router.push("/");
  }, [router]);

  useEffect(() => {
    if (state?.status !== "not_member") return;
    if (leaveIntent.current) finishLeaving(visit.current);
    else router.replace(`/join/${code}`);
  }, [state, code, router, finishLeaving]);

  // The group moved to a new lobby: follow it.
  useEffect(() => {
    if (state?.status === "moved") router.replace(`/lobby/${state.code}?moved=1`);
  }, [state, router]);

  // "Everyone was moved here" is only for before the next game starts.
  const hasGame = state?.status === "ok" && state.game !== null;
  useEffect(() => {
    if (moved && hasGame) router.replace(`/lobby/${code}`);
  }, [moved, hasGame, code, router]);

  if (state?.status === "moved") {
    return (
      <Screen>
        <p className={styles.loading}>Moving to the new lobby…</p>
      </Screen>
    );
  }

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

  const { me, members, maxMembers, lobby, game, myPicks, picksDone, options, myVote, votesDone } = state;
  const host = members.find((m) => m.isHost);
  const nextHost = members.find((m) => m.id !== me.id && !m.isDemo);
  // Demo friends are never "connected", but they count as here.
  const isOffline = (id: string) =>
    id !== me.id && online !== null && !online.has(id) && !members.find((m) => m.id === id)?.isDemo;
  const noticeBar = notice && <Notice key={notice.id} title={notice.title} body={notice.body} onClose={dismissNotice} />;

  async function addDemoFriends() {
    setAddingDemo(true);
    const res = await post(`/api/lobbies/${code}/demo`);
    setAddingDemo(false);
    if (!res.ok) showNotice({ title: res.message });
    refresh();
  }
  async function doChangeLobby() {
    if (changingRef.current) return;
    changingRef.current = true;
    const currentVisit = visit.current;
    setChangingLobby(true);
    setChangeError(null);
    const res = await post<{ code: string }>(`/api/lobbies/${code}/change`);
    // A late answer must not move a page you've since left.
    if (visit.current !== currentVisit) return;
    if (res.ok && typeof res.data?.code === "string") {
      router.replace(`/lobby/${res.data.code}?moved=1`);
      return;
    }
    changingRef.current = false;
    setChangingLobby(false);
    setChangeError(res.ok ? "Something went wrong. Try again." : res.message);
    refresh();
  }

  const hasDemo = members.some((m) => m.isDemo);
  const roomForDemo = members.length + 3 <= maxMembers;

  async function doLeave() {
    if (leavingRef.current) return;
    const currentVisit = visit.current;
    leaveIntent.current = true;
    leavingRef.current = true;
    setLeaving(true);
    setLeaveError(null);

    let left = false;
    try {
      left = await leave();
    } catch {
      // Keep the current screen and offer a retry even if a future transport
      // implementation rejects instead of returning false.
    }
    if (visit.current !== currentVisit || leaveFinished.current) return;
    if (left) {
      finishLeaving(currentVisit);
      return;
    }

    leavingRef.current = false;
    setLeaving(false);
    setLeaveError("Couldn't leave the lobby. Please try again.");
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

  // Matches the server: the host role passes to the earliest real member
  // (never a demo friend), the lobby ends when there is none, and a phone can
  // always come back to its own spot, even after the game has started.
  const rejoin = "You can come back from this phone with the same code.";
  const leaveBody = me.isHost
    ? nextHost
      ? `${nextHost.name} will become the host. ${rejoin}`
      : "No one else can host, so the lobby will end."
    : rejoin;

  const dialogs = (
    <>
      <ConfirmDialog
        open={confirmLeave}
        title="Leave this lobby?"
        body={leaveBody}
        confirmLabel={leaving ? "Leaving…" : "Leave lobby"}
        pending={leaving}
        error={leaveError ?? undefined}
        onConfirm={doLeave}
        onCancel={() => {
          if (leavingRef.current) return;
          leaveIntent.current = false;
          setConfirmLeave(false);
          setLeaveError(null);
        }}
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
      <ConfirmDialog
        open={confirmChange}
        title="Start a new lobby?"
        body="Everyone here moves to a new code for the next game. These results and the old code go away."
        confirmLabel={changingLobby ? "Moving…" : "Change lobby"}
        pending={changingLobby}
        error={changeError ?? undefined}
        onConfirm={doChangeLobby}
        onCancel={() => {
          if (changingLobby) return;
          setConfirmChange(false);
          setChangeError(null);
        }}
      />
    </>
  );

  const movedCard = moved && (
    <div className={styles.movedCard}>
      <InfoCard>The last game ended. Everyone was moved here, and the old code no longer works.</InfoCard>
    </div>
  );

  function renderScreen() {
    if (game) {
      if (game.stage === "picks") {
        if (!myPicks || !myPicks.ready) {
          return (
            <PicksScreen
              key={`${game.id}-${myPicks ? "change" : "new"}`}
              code={code}
              game={game}
              initial={myPicks}
              onSubmitted={refresh}
            />
          );
        }
        return (
          <WaitingScreen
            game={game}
            members={members}
            meId={me.id}
            picksDone={picksDone}
            onRemove={me.isHost ? setToRemove : undefined}
            isOffline={isOffline}
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
      if (game.stage === "round_complete") {
        return (
          <RoundCompleteScreen
            code={code}
            game={game}
            options={options}
            isHost={me.isHost}
            hostName={host?.name ?? "the host"}
            onContinued={refresh}
            notice={noticeBar}
          />
        );
      }
      if (game.stage === "results") {
        return (
          <ResultsScreen
            options={options}
            demo={lobby.isDemo}
            notice={noticeBar}
            footer={
              !me.isHost && (
                <p className={styles.note}>
                  When {host?.name ?? "the host"} changes the lobby, everyone moves to a new code together.
                </p>
              )
            }
          />
        );
      }

      // Voting: a round's cards and ranking (12, 13), or the final vote (15).
      const final = game.stage === "final_vote";
      if (myVote?.ready) {
        return (
          <WaitingScreen
            kind={final ? "final" : "votes"}
            game={game}
            members={members}
            meId={me.id}
            picksDone={votesDone}
            onRemove={me.isHost ? setToRemove : undefined}
            isOffline={isOffline}
            changing={changingVote}
            onChange={async () => {
              // Un-ready on the server first, so the round waits for us.
              setChangingVote(true);
              const res = await post(`/api/lobbies/${code}/vote`, { round: final ? 0 : game.currentRound }, "DELETE");
              setChangingVote(false);
              if (!res.ok) showNotice({ title: res.message });
              refresh();
            }}
            notice={noticeBar}
          />
        );
      }
      const rank = (back?: () => void) => (
        <RankScreen
          key={`${game.id}:${final ? 0 : game.currentRound}`}
          code={code}
          game={game}
          options={options}
          saved={myVote?.ranking ?? null}
          final={final}
          demo={lobby.isDemo}
          onGoToChoices={back}
          onSubmitted={refresh}
          notice={noticeBar}
        />
      );
      if (final) return rank();
      return (
        <CardsScreen
          game={game}
          options={options}
          notice={noticeBar}
          demo={lobby.isDemo}
          startVoting={myVote !== null}
          renderVote={rank}
        />
      );
    }

    if (me.isHost && settingUp && lobby.status === "open") {
      return <SetupScreen code={code} onBack={() => setSettingUp(false)} />;
    }

    if (me.isHost) {
      return (
        <Screen
          footer={
            <MainButton arrow onClick={() => setSettingUp(true)}>
              {moved ? "Set up the next game" : "Set up the game"}
            </MainButton>
          }
        >
          {noticeBar}
          <div className={styles.lobbyHeader}>
            <Title>{moved ? "New lobby" : "Your lobby"}</Title>
          </div>
          {movedCard}
          <CodeCard code={lobby.code} label={moved ? "New code" : "Code"} />
          <div className={styles.sectionHead}>
            <Label>Who&apos;s here</Label>
            <span className={styles.count}>
              {members.length} of {maxMembers}
              {moved ? " · open to latecomers" : members.length > 1 && " · tap a name to remove"}
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
        </Screen>
      );
    }

    return (
      <Screen>
        {noticeBar}
        <div className={styles.memberHeader}>
          <p className={styles.small}>Lobby {lobby.code}</p>
          <Title>Waiting for {host?.name ?? "the host"} to start</Title>
        </div>
        {movedCard}
        <StatusCard action={<ShareButton code={lobby.code} />}>The host is setting up the game</StatusCard>
        <div className={styles.sectionHead}>
          <Label>Who&apos;s here</Label>
          <span className={styles.count}>
            {members.length} of {maxMembers}
          </span>
        </div>
        {chips}
      </Screen>
    );
  }

  return (
    <div className={styles.lobbyFrame}>
      <div className={styles.lobbyActions}>
        {game?.stage === "results" && me.isHost ? (
          <>
          <PillButton
            aria-haspopup="dialog"
            disabled={leaving || changingLobby}
            onClick={() => {
              setLeaveError(null);
              setConfirmLeave(true);
            }}
          >
            {leaving ? "Leaving…" : "Leave"}
          </PillButton>
          <PillButton
            aria-haspopup="dialog"
            className={styles.changeLobby}
            disabled={changingLobby}
            onClick={() => {
              setChangeError(null);
              setConfirmChange(true);
            }}
          >
            <RefreshIcon />
            {changingLobby ? "Moving…" : "Change lobby"}
          </PillButton>
          </>
        ) : (
          <PillButton
            aria-haspopup="dialog"
            disabled={leaving}
            onClick={() => {
              setLeaveError(null);
              setConfirmLeave(true);
            }}
          >
            {leaving ? "Leaving…" : "Leave lobby"}
          </PillButton>
        )}
      </div>
      {renderScreen()}
      {dialogs}
    </div>
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
