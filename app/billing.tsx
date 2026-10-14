import { identityRevision, getRecoveryState } from "../src/api/session";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { gateway } from "../src/api/adapter";
import { errorText } from "../src/api/errors";
import { mode } from "../src/api/config";
import { formatDate } from "../src/domain/models";
import { Action, Body, Notice, Screen, Section, Title } from "../src/components/ui";
import { confirmAction } from "../src/components/Confirm";
import {
  billingConfigured,
  cancelRecovery,
  buy,
  loadProducts,
  loadExistingProofs,
  recover,
  recoverResult,
  abandonRecovery,
  verifyExisting,
  setBillingScreenFocused,
  type ProofCandidate,
  type PurchasesStoreProduct,
} from "../src/billing/service";
export default function Billing() {
  const client = useQueryClient();
  const [products, setProducts] = useState<PurchasesStoreProduct[]>([]);
  const [candidates, setCandidates] = useState<ProofCandidate[]>([]);
  const candidatesRef = useRef<ProofCandidate[]>([]);
  const generation = useRef(0);
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [notice, setNotice] = useState(
    identityRevision() > 0
      ? "認証を復元しました。契約状態を更新し、通知を再登録してください。購入サービスの接続確認に失敗しても復元を繰り返さないでください。"
      : "",
  );
  const recoveryStatus = useQuery({
    queryKey: ["recovery-state"],
    queryFn: getRecoveryState,
    enabled: mode === "api" && Platform.OS !== "web",
  });
  useEffect(() => {
    if (recoveryStatus.data) setRecovery(recoveryStatus.data.phase !== "none");
  }, [recoveryStatus.data]);
  const subscriptions = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => gateway.subscriptions(),
    enabled: mode === "api" && Platform.OS !== "web" && !recovery,
  });
  const clearProofs = useCallback(() => {
    candidatesRef.current = [];
    setCandidates([]);
    generation.current++;
  }, []);
  useFocusEffect(
    useCallback(() => {
      setBillingScreenFocused(true);
      return () => {
        setBillingScreenFocused(false);
        clearProofs();
      };
    }, [clearProofs]),
  );
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") clearProofs();
    });
    return () => listener.remove();
  }, [clearProofs]);
  const clearCache = async () => {
    await client.cancelQueries();
    client.clear();
  };
  const refresh = async () => {
    const [me, state] = await Promise.all([gateway.me(), gateway.subscriptions()]);
    client.setQueryData(["me"], me);
    client.setQueryData(["subscriptions"], state);
  };
  const run = async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setNotice("");
    try {
      await work();
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      if (mode === "api" && Platform.OS !== "web") await recoveryStatus.refetch();
      running.current = false;
      setBusy(false);
    }
  };
  const findProofs = (restore: boolean) =>
    void run(async () => {
      clearProofs();
      setRecovery(restore);
      if (restore) await clearCache();
      const current = generation.current;
      const result = await loadExistingProofs(restore);
      if (current !== generation.current || AppState.currentState !== "active") {
        setNotice("画面が切り替わったため購入候補を破棄しました。前面でもう一度確認してください。");
        return;
      }
      candidatesRef.current = result;
      setCandidates(result);
      setNotice(
        result.length
          ? "復元・再確認する購読を1つ選んでください。自動で結合しません。"
          : "対象となる購入を確認できませんでした。購入したストアのアカウントを確認してください。",
      );
    });
  return (
    <Screen>
      <Title>年間プランと復元</Title>
      {!billingConfigured && (
        <Notice>購入設定が未完了です。ここから購入・ストア照会・復元は開始できません。</Notice>
      )}
      <Section title="サーバーで確認した契約">
        {subscriptions.data?.subscriptions.map((item, index) => (
          <Body key={`${item.store}:${item.productId}:${index}`}>
            {item.plan === "basic" ? "基本 · 10宛先" : "拡張 · 50宛先"} ·{" "}
            {item.store === "apple" ? "App Store" : "Google Play"} · {item.status}
            {"\n"}
            ストア契約期限: {formatDate(item.validUntil)}
            {"\n"}最終検証: {formatDate(item.verifiedAt)}
          </Body>
        ))}
        {!subscriptions.data?.subscriptions.length && (
          <Body>有効な契約はまだ確認できていません。</Body>
        )}
        {subscriptions.error && <Notice error>{errorText(subscriptions.error)}</Notice>}
        <Notice>
          内部の利用期限はホーム・設定で確認できます。課金失敗で伝言を送ることはありません。
        </Notice>
        <Action
          label="契約状態を更新"
          secondary
          disabled={busy || mode !== "api" || recovery}
          onPress={() => void run(refresh)}
        />
      </Section>
      <Section title="このアカウントで購入">
        <Notice>
          毎年自動更新される購読です。実価格・無料体験の対象条件・更新条件はストアの確認画面を確認してください。元のデータがある方は先に下の復元を使ってください。
        </Notice>
        <Action
          label="ストアの年間プランを見る"
          disabled={!billingConfigured || busy || recovery}
          onPress={() =>
            void run(async () => {
              const available = await loadProducts();
              setProducts(available);
              if (!available.length)
                setNotice(
                  "購入できる年間商品を確認できませんでした。ストア設定と接続の確認が必要です。",
                );
            })
          }
        />
        {products.map((product) => (
          <Section key={product.identifier} title={product.title}>
            <Body>{product.description}</Body>
            <Body>{product.priceString} / 年</Body>
            <Action
              label={`${product.priceString} / 年 · ストアで購入を確認`}
              disabled={busy || recovery}
              onPress={() =>
                confirmAction(
                  "年間プランを確認",
                  "このアカウントでストアの購入画面を開きます。元のデータの復元ではありません。",
                  () =>
                    void run(async () => {
                      clearProofs();
                      await buy(product, refresh);
                      setNotice(
                        "サーバーの契約状態を更新しました。見守り開始は別の確認・操作が必要です。",
                      );
                    }),
                )
              }
            />
          </Section>
        ))}
        <Action
          label="購入済み・結果不明の購入を再確認"
          secondary
          disabled={!billingConfigured || busy || recovery}
          onPress={() => findProofs(false)}
        />
        <Notice>
          購入が保留・結果不明の場合は再購入せず、ストアの状態と購入済みの証明を再確認してください。
        </Notice>
      </Section>
      <Section title="同じストアで元のデータを復元">
        <Notice>
          購入したストアのアカウントが必要です。復元に成功すると旧端末の認証と通知登録が失効します。この端末の未同期下書きは統合しません。通知は復元後に設定から再登録してください。復元だけではチェックインや見守り再開は行いません。
        </Notice>
        <Action
          label="元のアカウントの購入を探す"
          secondary
          disabled={!billingConfigured || busy}
          onPress={() =>
            confirmAction(
              "元のデータを復元",
              "復元専用の端末認証へ切り替えます。処理中は現在のアカウント操作を止めます。結果不明時は保存した認証で結果を確認します。続けますか？",
              () => findProofs(true),
            )
          }
        />
        <Notice>
          復元の結果はサーバー受付から最大15分、保存した端末認証で再確認できます。確認しても期限は延長されません。
        </Notice>
        {recoveryStatus.data?.expiresAt && (
          <Notice>結果確認期限: {formatDate(recoveryStatus.data.expiresAt)}</Notice>
        )}
        {recoveryStatus.data?.phase === "pending" && (
          <Notice>復元結果は未確定です。再購入せず、結果を確認してください。</Notice>
        )}
        {recoveryStatus.data?.phase === "failed" && (
          <Notice error>
            復元は拒否されました。この操作の証明は変更できません。別の購入でやり直す場合は、先に下の操作で元の復元用認証を失効してください。
          </Notice>
        )}
        {recoveryStatus.data?.phase === "unavailable" && (
          <Notice error>
            期限切れまたは失効により結果を取得できません。復元が未実行だったとは限りません。
          </Notice>
        )}
        {recoveryStatus.data?.phase === "bootstrap-unknown" && (
          <Notice error>
            復元用の端末認証を確定できていません。復元結果の再取得対象外です。別のアカウントは自動作成しません。
          </Notice>
        )}
        {recoveryStatus.data?.phase === "abandoned" && (
          <Notice>
            前の復元用認証の失効を確認しました。「元のアカウントの購入を探す」から改めて始められます。
          </Notice>
        )}
        <Action
          label="送信した復元の結果を確認"
          secondary
          disabled={busy || !recoveryStatus.data?.canRetrieve}
          onPress={() =>
            void run(async () => {
              clearProofs();
              const result = await recoverResult(clearCache);
              setNotice(
                result.status === "completed"
                  ? "認証を復元しました。通知は設定から再登録してください。"
                  : result.status === "pending"
                    ? "まだ処理が完了していません。しばらくしてから改めて結果を確認してください。"
                    : "復元は拒否されました。別候補への変更には前の復元用認証の失効が必要です。",
              );
            })
          }
        />
        <Action
          label="前の復元用認証を失効してやり直せる状態にする"
          secondary
          disabled={busy || !recoveryStatus.data?.canAbandon}
          onPress={() =>
            confirmAction(
              "前の復元操作を終了",
              "元の復元用認証を失効します。失効を確認できるまで新しい復元は開始しません。既に成功していた場合も、元のアカウントへ自動で戻りません。",
              () =>
                void run(async () => {
                  clearProofs();
                  await abandonRecovery();
                  setNotice(
                    "失効を確認しました。必要なら購入を探す操作から復元をやり直してください。",
                  );
                }),
            )
          }
        />
        {recovery && recoveryStatus.data?.phase === "ready" && (
          <Action
            label="復元前のアカウントへ戻る"
            secondary
            disabled={busy}
            onPress={() =>
              void run(async () => {
                clearProofs();
                await cancelRecovery();
                await clearCache();
                setRecovery(false);
                setNotice("購入復元を中止しました。元のアカウントの状態を更新してください。");
              })
            }
          />
        )}
        {candidates.map((candidate, index) => (
          <Action
            key={index}
            label={`${recovery ? "復元" : "再確認"}候補 ${index + 1} · ${candidate.productIds.join(" / ")}`}
            disabled={busy}
            onPress={() =>
              confirmAction(
                "選んだ購読を確認",
                recovery
                  ? "この購入のサーバー検証に成功した場合だけ元のデータへ切り替えます。"
                  : "このアカウントに属する購入かサーバーで検証します。",
                () => {
                  const selected = candidatesRef.current[index];
                  if (!selected) return;
                  void run(async () => {
                    clearProofs();
                    if (recovery) {
                      const result = await recover(selected, clearCache);
                      setNotice(
                        result.revenueCatReady
                          ? "認証を復元しました。契約状態を更新し、通知を再登録してください。"
                          : "認証は復元しました。購入サービスの接続は再確認が必要です。復元は繰り返さないでください。",
                      );
                      setRecovery(false);
                    } else {
                      await verifyExisting(selected, refresh);
                      setNotice("購入をサーバーで再確認しました。");
                    }
                  });
                },
              )
            }
          />
        ))}
      </Section>
      {!!notice && <Notice>{notice}</Notice>}
      {busy && <Notice>処理中です。完了前に購入・復元済みとは扱いません。</Notice>}
      <Action
        label="ストアで購読を管理"
        secondary
        disabled={Platform.OS === "web" || busy}
        onPress={() =>
          void run(async () => {
            await Linking.openURL(
              Platform.OS === "ios"
                ? "https://apps.apple.com/account/subscriptions"
                : "https://play.google.com/store/account/subscriptions",
            );
          })
        }
      />
    </Screen>
  );
}
