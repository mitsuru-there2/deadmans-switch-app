import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { gateway } from "../src/api/adapter";
import { mode } from "../src/api/config";
import { errorText } from "../src/api/errors";
import { Action, Body, Notice, Screen, Section, Title } from "../src/components/ui";
export default function About() {
  const consent = useQuery({
    queryKey: ["consent"],
    queryFn: () => gateway.consent(),
    enabled: mode === "api",
  });
  return (
    <Screen>
      <Title subtitle="もしものときに、伝えたいことを。">私に何かあったら</Title>
      <Section title="届くまでの流れ">
        <Body>1. 宛先を選び、その人への伝言を残します。</Body>
        <Body>2. 本人の確認が一定期間ない場合は、まずあなたに警告します。</Body>
        <Body>3. 警告後の猶予も過ぎると、宛先別の伝言リンクを通知します。</Body>
        <Body>
          4. 受取人は認証後、別の手段であなたの死亡を確認したと明示同意してから、本文を開きます。
        </Body>
      </Section>
      <Section title="知っておいてほしいこと">
        <Body>
          死亡を検知する機能ではありません。受取人の同意は自己申告で、公的な死亡確認ではありません。
        </Body>
        <Body>
          通信や通知に気づかず確認が途絶えると、意図せずリンクが送られる可能性があります。
        </Body>
        <Body>
          受取承諾と、開封前の死亡確認への同意は別です。通知には本文・件名・抜粋を含めません。
        </Body>
        <Body>緊急通報、救助、法的な遺言、解約や送金の代行を行うアプリではありません。</Body>
      </Section>
      <Section title="サーバーの利用条件">
        {consent.data ? (
          <>
            <Body>{consent.data.title}</Body>
            <Body>{consent.data.body}</Body>
            <Notice>版: {consent.data.version}</Notice>
          </>
        ) : (
          <Notice>
            {consent.error ? errorText(consent.error) : "API 接続後に最新の同意本文を表示します。"}
          </Notice>
        )}
      </Section>
      <Notice>読むだけで見守りの有効化や契約への同意は行われません。</Notice>
      <Action label="閉じる" onPress={() => router.back()} />
    </Screen>
  );
}
