import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState, Switch as Toggle } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Action, Body, Notice, Row, Screen, Section, Title } from "../src/components/ui";
import { gateway } from "../src/api/adapter";
import { mode } from "../src/api/config";
import { errorText } from "../src/api/errors";
import { useData } from "../src/services/data";
import { blockerCopy } from "../src/domain/blockers";
import { canActivate } from "../src/domain/setup";
import { formatDate, stateCopy } from "../src/domain/models";
export default function Activate() {
  const { me, recipients, messages } = useData();
  const consent = useQuery({
    queryKey: ["consent"],
    queryFn: () => gateway.consent(),
    enabled: mode === "api",
    staleTime: 0,
  });
  const client = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  useFocusEffect(useCallback(() => () => setAgreed(false), []));
  const [notice, setNotice] = useState("");
  const [attempted, setAttempted] = useState(false);
  const state = me.data?.switch;
  useEffect(() => {
    setAgreed(false);
  }, [state?.version, consent.data?.version]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") setAgreed(false);
    });
    return () => sub.remove();
  }, []);
  const activate = useMutation({
    mutationFn: async () => {
      if (!state || !consent.data || !agreed || !canActivate(state)) return;
      await gateway.activate(state.version, consent.data.version);
      setNotice("サーバーが開始操作を受け付けました。以下の最新状態を確認してください。");
    },
    retry: false,
    onSettled: async () => {
      setAgreed(false);
      setAttempted(true);
      await client.invalidateQueries();
    },
  });
  const refresh = async () => {
    setAgreed(false);
    const results = await Promise.all([
      me.refetch(),
      consent.refetch(),
      recipients.refetch(),
      messages.refetch(),
    ]);
    if (results.every((r) => r.isSuccess)) setAttempted(false);
  };
  return (
    <Screen>
      <Title>{state?.state === "draft" ? "見守りを始める" : "見守りを再開する"}</Title>
      {state && (
        <>
          <Notice>現在: {stateCopy[state.state].title}</Notice>
          <Row
            title="確認がない期間"
            detail={`${state.inactivityDays}日 / 警告後の猶予 ${state.graceDays}日`}
          />
          <Row
            title="受取承諾済みの宛先"
            detail={`${recipients.data?.filter((r) => r.status === "accepted").length ?? 0}人 / 保存した伝言 ${messages.data?.length ?? 0}通`}
          />
          <Row title="確認期限" detail={formatDate(state.confirmationDueAt)} />
          {state.activationBlockers.map((code) => (
            <Notice key={code} error>
              {blockerCopy[code] ?? "設定の確認が必要です"}
            </Notice>
          ))}
        </>
      )}
      <Section title="送信条件を最後まで確認">
        {consent.data ? (
          <>
            <Body>{consent.data.title}</Body>
            <Body>{consent.data.body}</Body>
            <Notice>同意版: {consent.data.version}</Notice>
          </>
        ) : (
          <Notice>接続後、サーバーの最新の同意文を全文表示します。</Notice>
        )}
        <Body>
          上の説明と、宛先・伝言・期限を確認し、この条件で見守りを開始／再開することに同意します。
        </Body>
        <Toggle
          accessibilityLabel="送信条件を確認して同意する"
          value={agreed}
          onValueChange={setAgreed}
          disabled={!consent.data || activate.isPending || mode !== "api"}
        />
        <Action
          label={
            activate.isPending
              ? "サーバーで確認中…"
              : state?.state === "draft"
                ? "同意して見守りを始める"
                : "同意して見守りを再開する"
          }
          disabled={
            mode !== "api" ||
            !state ||
            !canActivate(state) ||
            !agreed ||
            !consent.data ||
            activate.isPending ||
            attempted
          }
          onPress={() => activate.mutate()}
        />
      </Section>
      <Action
        label="条件と最新状態を読み直す"
        secondary
        disabled={mode !== "api" || activate.isPending}
        onPress={() => void refresh()}
      />
      {activate.error && <Notice error>{errorText(activate.error)}</Notice>}
      {consent.error && <Notice error>{errorText(consent.error)}</Notice>}
      {me.error && <Notice error>{errorText(me.error)}</Notice>}
      {!!notice && <Notice>{notice}</Notice>}
      <Notice>
        停止・保留中は、チェックインだけでは再開しません。開始条件はサーバーでも再確認します。
      </Notice>
    </Screen>
  );
}
