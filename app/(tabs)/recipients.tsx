import { router } from "expo-router";
import { Action, Body, Notice, Row, Screen, Section, Title } from "../../src/components/ui";
import { useData } from "../../src/services/data";
import { consentCopy, editable } from "../../src/domain/models";
import { errorText } from "../../src/api/errors";
export default function Recipients() {
  const { me, recipients, ready } = useData();
  const canEdit = ready && !!me.data && editable(me.data.switch);
  return (
    <Screen>
      <Title subtitle="伝言は、一人ひとりに分けて残せます。">宛先</Title>
      <Action
        label="宛先を追加"
        disabled={!canEdit}
        onPress={() => router.push("/recipient/new")}
      />
      {!ready && (
        <Notice>宛先の登録には、サーバーで確認された契約が必要です。購入接続は準備中です。</Notice>
      )}
      {me.data && !editable(me.data.switch) && (
        <Notice>宛先を編集する前に、ホームから見守りを停止してください。</Notice>
      )}
      {recipients.error && <Notice error>{errorText(recipients.error)}</Notice>}
      <Section title="メールで届ける相手">
        {recipients.data?.length ? (
          recipients.data.map((r) => (
            <Row
              key={r.id}
              title={r.name}
              detail={r.email}
              trailing={consentCopy[r.status]}
              onPress={() => router.push({ pathname: "/message/[id]", params: { id: r.id } })}
            />
          ))
        ) : (
          <Body muted>まだ宛先がありません。まずは大切な一人から。</Body>
        )}
      </Section>
      <Notice>
        受取承諾は、登録時の確認です。本文を開く際には、別の手段で死亡を確認したという明示同意が必要になります。
      </Notice>
      <Notice>初期版の宛先はメールのみです。通知には伝言の件名・本文・抜粋を載せません。</Notice>
    </Screen>
  );
}
