import { router } from "expo-router";
import { Alert, Platform, View } from "react-native";
import { blockerCopy } from "../../src/domain/blockers";
import { useState } from "react";
import { useQuery, useQueryClient, skipToken } from "@tanstack/react-query";
import {
  Action,
  Body,
  Notice,
  Reveal,
  Row,
  Screen,
  Section,
  Title,
  usePalette,
} from "../../src/components/ui";
import { useData, useOperation } from "../../src/services/data";
import { foregroundCheckIn } from "../../src/services/checkin";
import { gateway } from "../../src/api/adapter";
import { mode } from "../../src/api/config";
import { errorText } from "../../src/api/errors";
import { entitled, formatDate, stateCopy } from "../../src/domain/models";
export default function Home() {
  const { me, recipients, messages } = useData();
  const p = usePalette();
  const client = useQueryClient();
  const [notice, setNotice] = useState("");
  const checkIn = useOperation(async () => {
    setNotice("");
    await foregroundCheckIn("button");
    client.setQueryData(["foreground-error"], "");
    setNotice("サーバーが今の確認を受け付けました。最新の状態を確認してください。");
  });
  const pause = useOperation(async () => gateway.pause());
  const state = me.data?.switch;
  const foregroundError = useQuery<string>({ queryKey: ["foreground-error"], queryFn: skipToken });
  const stop = () => {
    const description =
      "送信処理中のリンク通知は届く場合がありますが、受取画面の閲覧を停止します。すでに取得された内容は回収できません。";
    if (Platform.OS === "web") {
      if (window.confirm(description)) pause.mutate();
    } else
      Alert.alert("見守りを停止しますか？", description, [
        { text: "戻る", style: "cancel" },
        { text: "停止する", style: "destructive", onPress: () => pause.mutate() },
      ]);
  };
  return (
    <Screen>
      <Title subtitle="大切な人への伝言を、少しずつ。">私に何かあったら</Title>
      {mode === "unconfigured" && (
        <Notice>サービス接続は未設定です。見守りやチェックインは行われていません。</Notice>
      )}
      {!!foregroundError.data && <Notice error>{foregroundError.data}</Notice>}
      {me.isPending && mode !== "unconfigured" && <Notice>状態を確認しています…</Notice>}
      {me.error && (
        <>
          <Notice error>{errorText(me.error)}</Notice>
          <Action
            label="状態を更新"
            onPress={() => {
              void me.refetch();
            }}
            secondary
          />
        </>
      )}
      {state && (
        <Reveal>
          <View
            style={{
              gap: 12,
              borderLeftWidth: 3,
              borderLeftColor: p.accent,
              paddingLeft: 20,
              paddingVertical: 10,
            }}
          >
            <Notice>{mode === "demo" ? "デモの状態" : "サーバーで確認した状態"}</Notice>
            <Title>{stateCopy[state.state].title}</Title>
            <Body muted>{stateCopy[state.state].detail}</Body>
          </View>
          <Section title="確認の予定 · 日本時間">
            <Row title="最後のチェックイン" detail={formatDate(state.lastCheckInAt)} />
            <Row title="次の確認期限" detail={formatDate(state.confirmationDueAt)} />
            <Row
              title="最も早い公開予定"
              detail={
                state.earliestReleaseAt === null
                  ? "未確定 · 本人への警告が受け付けられてから決まります"
                  : formatDate(state.earliestReleaseAt)
              }
            />
          </Section>
          {!!state.holdReason && <Notice error>保留理由: {state.holdReason}</Notice>}
          <Notice>
            {mode === "demo"
              ? "実際の確認期限は設定されていません。"
              : `最終取得: ${formatDate(me.dataUpdatedAt)}。通信が切れている間もサーバーの期限は進みます。`}
          </Notice>
          <Action
            label={checkIn.isPending ? "サーバーに確認中…" : "今の状態を知らせる"}
            disabled={mode !== "api" || !entitled(state) || checkIn.isPending}
            onPress={() => checkIn.mutate()}
          />
          {mode === "demo" && (
            <Notice>チェックインは API 接続後に利用できます。デモで確認済みにはなりません。</Notice>
          )}
          {!!notice && <Notice>{notice}</Notice>}
          {checkIn.error && <Notice error>{errorText(checkIn.error)}</Notice>}
          {mode === "api" && (
            <Action
              label="サーバーの状態を更新"
              onPress={() => {
                void me.refetch();
              }}
              secondary
            />
          )}
          {mode === "api" && state.state !== "draft" && (
            <Action
              label={pause.isPending ? "停止を確認中…" : "見守りを停止する"}
              onPress={stop}
              secondary
              disabled={pause.isPending}
            />
          )}
          {pause.error && <Notice error>{errorText(pause.error)}</Notice>}
        </Reveal>
      )}
      <Section title="伝言を準備する">
        <Row
          title="宛先と伝言"
          detail="誰に、何を託すかを考える"
          trailing={`${recipients.data?.length ?? 0} 人`}
          onPress={() => router.push("/recipients")}
        />
        <Row
          title="書きかけの伝言"
          detail="端末の下書きと保存した伝言を確認"
          trailing={`${messages.data?.length ?? 0} 通`}
          onPress={() => router.push("/drafts")}
        />
      </Section>
      <Section title="見守りを始める前に">
        {state?.activationBlockers.map((code) => (
          <Notice key={code}>{blockerCopy[code] ?? "設定の確認が必要です"}</Notice>
        ))}
        <Body muted>
          本人メールの確認、宛先の承諾、年間プラン、自分宛の通知テスト、送信条件の確認が必要です。
        </Body>
        <Action
          label={
            state?.state === "draft"
              ? "条件を確認して見守りを始める"
              : "条件を確認して見守りを再開する"
          }
          disabled={mode !== "api" || !state || !["draft", "paused", "held"].includes(state.state)}
          onPress={() => router.push("/activate")}
        />
        <Row title="本人メールの確認" onPress={() => router.push("/contact")} />
        <Row title="自分宛の通知テスト・配信状態" onPress={() => router.push("/deliveries")} />
        <Notice>課金の失敗や契約切れを理由に、伝言を送ることはありません。</Notice>
      </Section>
      <Row title="仕組みと大切なこと" onPress={() => router.push("/about")} />
    </Screen>
  );
}
