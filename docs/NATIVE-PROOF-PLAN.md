# 次の区切り: 購入証明ブリッジ

API `b52e61a` の `docs/app-contract.md` を読込確認。小さなローカル Expo Module と RevenueCat 接続は実装可能です。今回の区切りでは本人確認・監視・通知登録を先に完了し、購入と復旧の認証条件を緩めていません。

確認したインストール済み依存は RNPurchases 10.13.0 / PurchasesHybridCommon 19.11.0（iOS Podfile.lock・Android build.gradle）。実ストア設定と購入は未実行です。

## 実装単位

1. `modules/store-proof` を Expo local module として追加。iOS は StoreKit2 の verified / 本人購入 / 有効な対象の自動更新購読から `VerificationResult.jwsRepresentation` を返す。`AppStore.sync()` は利用者が復旧を選んだ場合のみ。Android は BillingClient の SUBS 照会で PURCHASED の `purchaseToken` を返す。購入・finish・acknowledge・consume はブリッジに追加しない。
2. 本人Bearerの `/billing/account` から取得した raw UUID を RevenueCat appUserID に設定。Android側ではSDKがBase64(SHA-256(UUID))を設定し、APIが双方を照合する。通常購入は iOS transactionIdentifier / Android purchaseToken を `/billing/verify` へ送る。成功応答後にme/subscriptionsを再取得する。
3. 復旧では新しいアカウントのRevenueCatへ先にrestore/logInしない。ネイティブから元の購入証明を取得し、`/auth/restore` でAPI検証した後、返却Bearer/userId/accountTokenをSecureStoreへ一括保存し、Query cacheを消去して元accountTokenへRevenueCatを合わせる。通知登録は再設定、チェックイン・監視再開は発火しない。
4. 現 `session.ts` は bootstrap/renew の途中結果喪失をfail-closedにする設計。復旧もpendingを書いてから処理し、応答喪失で旧Bearer復帰や別アカウントbootstrapをしない。accountTokenは現在保存していないため、billing/account取得と復旧時の保存契約を明示して拡張する。

## 必要な判断と検証

- 複数購入候補・別所有者の候補を自動結合しない。商品名と購読候補の選択画面が必要。
- CustomerInfoは復旧証明ではなく、UIの購入状態表示だけに限定。JWS/purchaseTokenをログ、URL、SQLite、TanStack mutation variablesへ保存しない。
- APIの未登録購入・family sharing・失効・保留・識別子なしを拒否する条件を維持。復旧前RevenueCat移転設定は未確定のため実ストア検証が必要。
- ブリッジとJS orchestrationのローカル検証後も、署名検証・復旧・権利付与は実ストアsandboxで別途確認する。実鍵がない現段階で成功を表示しない。
