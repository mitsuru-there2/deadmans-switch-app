import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { contactEmailSchema } from "deadmans-switch-api/contracts";
import { Action, Body, Input, Notice, Screen, Section, Title } from "../src/components/ui";
import { confirmAction } from "../src/components/Confirm";
import { gateway } from "../src/api/adapter";
import { mode } from "../src/api/config";
import { errorText } from "../src/api/errors";
import { useData } from "../src/services/data";
import { contactToken } from "../src/domain/setup";
export default function Contact() {
  const { me, ready } = useData();
  const client = useQueryClient();
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");
  const [sent, setSent] = useState(false);
  useFocusEffect(useCallback(() => () => setLink(""), []));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") setLink("");
    });
    return () => sub.remove();
  }, []);
  const request = useMutation({
    mutationFn: gateway.requestContact,
    retry: false,
    onSuccess: () =>
      setNotice("確認メールの依頼を受け付けました。配信や本人確認はまだ完了していません。"),
    onSettled: () => {
      setSent(true);
      void client.invalidateQueries();
    },
  });
  const confirm = useMutation({
    mutationFn: async () => {
      const token = contactToken(link);
      setLink("");
      if (!token) throw new Error("Invalid link");
      await gateway.confirmContact(token);
    },
    retry: false,
    gcTime: 0,
    onSuccess: () => {
      setLink("");
      setNotice("本人メールの確認を受け付けました。最新の状態を確認してください。");
    },
    onSettled: () => {
      setLink("");
      void client.invalidateQueries();
    },
  });
  const form = useForm({
    defaultValues: { name: "", email: "" },
    validators: { onChange: contactEmailSchema, onSubmit: contactEmailSchema },
    onSubmit: async ({ value }) =>
      confirmAction(
        "本人のメールに送ります",
        `${value.email} に確認リンクを送ります。1日3回までです。`,
        () => request.mutate(value),
      ),
  });
  const verified = me.data?.user.emailVerified;
  return (
    <Screen>
      <Title>本人メールの確認</Title>
      <Notice>
        {verified
          ? `確認済み: ${me.data?.user.email}`
          : "あなた自身が受け取れるメールを登録します。"}
      </Notice>
      {!verified && (
        <Section title="確認メールを依頼">
          <form.Field name="name">
            {(field) => (
              <Input
                label="あなたの名前"
                value={field.state.value}
                onChangeText={field.handleChange}
                maxLength={100}
              />
            )}
          </form.Field>
          <form.Field name="email">
            {(field) => (
              <Input
                label="本人メール"
                value={field.state.value}
                onChangeText={field.handleChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={254}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.canSubmit}>
            {(canSubmit) => (
              <Action
                label={request.isPending ? "依頼中…" : "確認メールを送る"}
                disabled={!canSubmit || !ready || mode !== "api" || request.isPending || sent}
                onPress={() => void form.handleSubmit()}
              />
            )}
          </form.Subscribe>
          {sent && (
            <Notice>
              再送前に受信箱と確認状態を調べてください。応答が不明でも依頼が届いている場合があります。
            </Notice>
          )}
        </Section>
      )}
      {!verified && (
        <Section title="届いたリンクで確認">
          <Body>
            この端末で依頼した確認メールのリンクを貼り付けてください。内容は保存せず、確認操作の際にだけサーバーへ送ります。
          </Body>
          <Input
            label="確認リンク"
            value={link}
            onChangeText={setLink}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={2048}
          />
          <Action
            label={confirm.isPending ? "確認中…" : "このメールを本人の連絡先として確認"}
            disabled={mode !== "api" || !contactToken(link) || confirm.isPending}
            onPress={() => confirm.mutate()}
          />
        </Section>
      )}
      <Action
        label="確認状態を更新"
        secondary
        onPress={async () => {
          const result = await me.refetch();
          if (result.isSuccess) setSent(false);
        }}
      />
      {request.error && <Notice error>{errorText(request.error)}</Notice>}
      {confirm.error && <Notice error>{errorText(confirm.error)}</Notice>}
      {!!notice && <Notice>{notice}</Notice>}
      {mode !== "api" && <Notice>デモではメール送信・本人確認を実行しません。</Notice>}
    </Screen>
  );
}
