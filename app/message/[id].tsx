import { useState } from "react";
import { Alert, Platform, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { usePreventRemove, useNavigation } from "expo-router/react-navigation";
import {
  Action,
  Body,
  Input,
  Notice,
  Reveal,
  Row,
  Screen,
  Section,
  Title,
} from "../../src/components/ui";
import { useData } from "../../src/services/data";
import { gateway } from "../../src/api/adapter";
import { mode } from "../../src/api/config";
import { errorText, AppError } from "../../src/api/errors";
import {
  consentCopy,
  editable,
  messageInputSchema,
  type Draft,
  type Message,
  type Recipient,
} from "../../src/domain/models";
import { templates, composeSection, type WritingTemplate } from "../../src/domain/templates";
import { getDraft, saveDraft, deleteDraft } from "../../src/storage/drafts";
import { storageDescription } from "../../src/storage/vault";

export default function EditorRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useData();
  const draft = useQuery({
    queryKey: ["draft", data.scope, id],
    queryFn: () => getDraft(data.scope, id),
    enabled: !!data.me.data,
  });
  const recipient = data.recipients.data?.find((r) => r.id === id);
  if (draft.error)
    return (
      <Screen>
        <Notice error>{errorText(draft.error)}</Notice>
      </Screen>
    );
  if (!recipient || !data.me.data || draft.isPending || data.messages.isPending)
    return (
      <Screen>
        <Notice>
          {data.recipients.isPending || draft.isPending || data.messages.isPending
            ? "伝言を開いています…"
            : "宛先を確認できません。宛先一覧を更新してください。"}
        </Notice>
      </Screen>
    );
  if (data.messages.error)
    return (
      <Screen>
        <Notice error>{errorText(data.messages.error)}</Notice>
      </Screen>
    );
  return (
    <Editor
      key={`${data.scope}:${id}`}
      recipient={recipient}
      local={draft.data}
      saved={data.messages.data?.find((m) => m.recipientId === id)}
      version={data.me.data.switch.version}
      scope={data.scope}
      canEdit={data.ready && editable(data.me.data.switch)}
    />
  );
}
function Editor({
  recipient,
  local,
  saved,
  version,
  scope,
  canEdit,
}: {
  recipient: Recipient;
  local: Draft | null;
  saved?: Message;
  version: number;
  scope: string;
  canEdit: boolean;
}) {
  const client = useQueryClient();
  const navigation = useNavigation();
  const [baseVersion, setBaseVersion] = useState(local?.baseVersion ?? version);
  const [baseline, setBaseline] = useState({
    title: local?.title ?? saved?.title ?? "",
    body: local?.body ?? saved?.body ?? "",
  });
  const [notice, setNotice] = useState(
    local ? "端末の下書きを開きました。まだサーバーには同期されていません。" : "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [template, setTemplate] = useState<WritingTemplate | null>(null);
  const [questions, setQuestions] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const form = useForm({ defaultValues: baseline });
  usePreventRemove(dirty, ({ data }) => {
    const leave = () => navigation.dispatch(data.action);
    if (Platform.OS === "web") {
      if (window.confirm("保存していない変更を破棄して戻りますか？")) leave();
    } else
      Alert.alert(
        "変更が保存されていません",
        "戻る前に「端末に下書きを保存」を押すと、続きを書けます。",
        [
          { text: "編集を続ける", style: "cancel" },
          { text: "破棄して戻る", style: "destructive", onPress: leave },
        ],
      );
  });
  const change = (field: "title" | "body", value: string) => {
    form.setFieldValue(field, value);
    setDirty(true);
    setNotice("未保存の変更があります");
  };
  const persist = async (sync: boolean) => {
    setError("");
    setBusy(true);
    const value = { title: form.state.values.title, body: form.state.values.body };
    try {
      if (sync) {
        const parsed = messageInputSchema.safeParse(value);
        if (!parsed.success) {
          setError(parsed.error.issues.map((i) => i.message).join("。"));
          return;
        }
        // Preserve a local copy before attempting a request whose outcome may be uncertain.
        await saveDraft(scope, {
          ...value,
          recipientId: recipient.id,
          baseVersion,
          updatedAt: Date.now(),
        });
        if (baseVersion !== version) throw new AppError("VERSION_CONFLICT");
        await gateway.saveMessage(recipient.id, parsed.data, baseVersion);
        const updated = await gateway.me();
        setBaseVersion(updated.switch.version);
        await deleteDraft(scope, recipient.id);
        setNotice(
          mode === "demo"
            ? "デモの伝言を端末に保存しました。サーバーには送られていません。"
            : "サーバーへの保存を確認しました。",
        );
      } else {
        await saveDraft(scope, {
          ...value,
          recipientId: recipient.id,
          baseVersion,
          updatedAt: Date.now(),
        });
        setNotice("端末に下書きを保存しました。サーバーにはまだ同期されていません。");
      }
      setBaseline(value);
      setDirty(false);
      await client.invalidateQueries();
    } catch (e) {
      setError(errorText(e));
      if (e instanceof AppError && e.code === "VERSION_CONFLICT") await client.invalidateQueries();
    } finally {
      setBusy(false);
    }
  };
  const remove = () => {
    const run = async () => {
      setBusy(true);
      try {
        await gateway.removeRecipient(recipient.id, version);
        await deleteDraft(scope, recipient.id);
        setDirty(false);
        await client.invalidateQueries();
        router.replace("/recipients");
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`${recipient.name}さんの宛先と伝言、端末の下書きを削除しますか？`))
        void run();
    } else
      Alert.alert(
        "宛先と伝言を削除",
        `${recipient.name}さんの宛先と伝言、端末の下書きを削除します。`,
        [
          { text: "戻る", style: "cancel" },
          {
            text: "削除",
            style: "destructive",
            onPress: () => {
              void run();
            },
          },
        ],
      );
  };
  return (
    <Screen>
      <Title subtitle={`${recipient.email} · ${consentCopy[recipient.status]}`}>
        {recipient.name}さんへの伝言
      </Title>
      <Notice>最終通知には件名・本文・抜粋を載せず、この人専用のリンクだけを届けます。</Notice>
      {!canEdit && <Notice error>見守りを停止してから編集できます。</Notice>}
      {baseVersion !== version && (
        <Section title="更新の競合">
          <Notice error>別の操作による更新があります。端末の下書きは保持しています。</Notice>
          <Action label="最新の保存内容を確認" secondary onPress={() => setShowRemote(true)} />
          {showRemote && (
            <>
              <Body>{saved?.title ?? "保存された伝言はありません"}</Body>
              <Body>{saved?.body ?? ""}</Body>
            </>
          )}
          <Action
            label="最新の内容を確認したので、この編集を残す"
            disabled={!showRemote}
            secondary
            onPress={() => {
              setBaseVersion(version);
              setNotice("次の保存で、現在の編集内容を反映します。");
            }}
          />
        </Section>
      )}
      <Action
        label={preview ? "自由編集に戻る" : "内容を確認する"}
        secondary
        onPress={() => setPreview(!preview)}
      />
      {preview ? (
        <Reveal>
          <Body>{form.state.values.title || "件名未入力"}</Body>
          <Body>{form.state.values.body || "本文未入力"}</Body>
        </Reveal>
      ) : (
        <>
          <form.Field name="title">
            {(f) => (
              <Input
                label="件名"
                placeholder="伝えておきたいこと"
                value={f.state.value}
                maxLength={200}
                editable={canEdit && !busy}
                onChangeText={(v) => change("title", v)}
              />
            )}
          </form.Field>
          <form.Field name="body">
            {(f) => (
              <>
                <Input
                  label="伝言"
                  placeholder="短い言葉からで大丈夫です。"
                  value={f.state.value}
                  multiline
                  maxLength={20000}
                  editable={canEdit && !busy}
                  style={{ minHeight: 230 }}
                  onChangeText={(v) => change("body", v)}
                />
                <Notice>{f.state.value.length.toLocaleString()} / 20,000 文字</Notice>
              </>
            )}
          </form.Field>
          <Action
            label={questions ? "お願いの選択を閉じる" : "お願いを追加する"}
            secondary
            disabled={!canEdit || busy}
            onPress={() => {
              setQuestions(!questions);
              setTemplate(null);
            }}
          />
          {questions && (
            <Section title="何をお願いしたいですか？">
              {templates.map((t) => (
                <Row
                  key={t.id}
                  title={t.title}
                  detail={t.hint}
                  onPress={() => {
                    setTemplate(t);
                    setAnswers(t.questions.map(() => ""));
                    setQuestions(false);
                  }}
                />
              ))}
            </Section>
          )}
          {template && (
            <Reveal>
              <Section title={template.title}>
                {template.questions.map((q, i) => (
                  <Input
                    key={`${template.id}:${i}`}
                    label={q}
                    value={answers[i] ?? ""}
                    multiline
                    maxLength={6000}
                    onChangeText={(v) => setAnswers((old) => old.map((a, j) => (i === j ? v : a)))}
                  />
                ))}
                <Action
                  label="伝言に追加して自由編集"
                  disabled={!answers.some((a) => a.trim())}
                  onPress={() => {
                    const next = [form.state.values.body, composeSection(template, answers)]
                      .filter(Boolean)
                      .join("\n\n");
                    if (next.length > 20000) {
                      setError("追加すると20,000文字を超えます。短くしてください。");
                      return;
                    }
                    change("body", next);
                    setTemplate(null);
                  }}
                />
                <Action label="このお願いを取り消す" secondary onPress={() => setTemplate(null)} />
              </Section>
            </Reveal>
          )}
        </>
      )}
      <Notice>
        パスワードや秘密鍵そのものは入力しないでください。保管場所や相談先を伝えられます。
      </Notice>
      {!!error && <Notice error>{error}</Notice>}
      {!!notice && <Notice>{notice}</Notice>}
      <Action
        label={busy ? "保存中…" : "端末に下書きを保存"}
        disabled={!canEdit || busy}
        onPress={() => {
          void persist(false);
        }}
      />
      <Action
        label={mode === "demo" ? "デモの伝言として保存" : "サーバーに保存"}
        disabled={!canEdit || busy || baseVersion !== version}
        secondary
        onPress={() => {
          void persist(true);
        }}
      />
      <Notice>{storageDescription}</Notice>
      <Action label="招待メール · 接続準備中" disabled secondary onPress={() => {}} />
      <Action label="この宛先と伝言を削除" disabled={!canEdit || busy} secondary onPress={remove} />
    </Screen>
  );
}
