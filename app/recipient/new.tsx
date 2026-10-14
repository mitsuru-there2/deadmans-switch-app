import { useForm } from "@tanstack/react-form";
import { router } from "expo-router";
import { Action, Input, Notice, Screen, Title } from "../../src/components/ui";
import { useData, useOperation } from "../../src/services/data";
import { gateway } from "../../src/api/adapter";
import { editable, recipientInputSchema, type RecipientInput } from "../../src/domain/models";
import { errorText } from "../../src/api/errors";
import { mode } from "../../src/api/config";
export default function AddRecipient() {
  const { me, ready } = useData();
  const add = useOperation(async (input: RecipientInput) => {
    if (!me.data || !editable(me.data.switch)) return;
    await gateway.addRecipient(input, me.data.switch.version);
  });
  const form = useForm({
    defaultValues: { name: "", email: "" },
    validators: { onSubmit: recipientInputSchema },
    onSubmit: async ({ value }) => {
      await add.mutateAsync(recipientInputSchema.parse(value));
      router.back();
    },
  });
  return (
    <Screen>
      <Title subtitle="この人にだけ届ける伝言を作ります。">誰に託しますか？</Title>
      <form.Field name="name">
        {(field) => (
          <>
            <Input
              label="相手の名前"
              placeholder="例: はるか"
              value={field.state.value}
              onChangeText={field.handleChange}
              onBlur={field.handleBlur}
              maxLength={100}
            />
            <Notice error>{field.state.meta.errors.map((e) => e?.message).join(" ")}</Notice>
          </>
        )}
      </form.Field>
      <form.Field name="email">
        {(field) => (
          <>
            <Input
              label="メールアドレス"
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={field.state.value}
              onChangeText={field.handleChange}
              onBlur={field.handleBlur}
              maxLength={254}
            />
            <Notice error>{field.state.meta.errors.map((e) => e?.message).join(" ")}</Notice>
          </>
        )}
      </form.Field>
      {add.error && <Notice error>{errorText(add.error)}</Notice>}
      <Action
        label={add.isPending ? "保存中…" : mode === "demo" ? "デモの宛先を追加" : "宛先を追加"}
        disabled={!ready || !me.data || !editable(me.data.switch) || add.isPending}
        onPress={() => {
          void form.handleSubmit().catch(() => {});
        }}
      />
      <Notice>
        この操作では招待メールを送信しません。宛先の確認後に、受取承諾を依頼する機能を接続します。
      </Notice>
    </Screen>
  );
}
