# 購入証明ブリッジとクライアント連携

2026-10-14。API `e087a7a` の `docs/app-contract.md` に対応。コードとローカルモック、iOS/Android development buildを検証済み。実ストアでの証明取得・購入・復元は未実施です。

## 実装

- `modules/store-proof` はExpo local moduleです。iOSはStoreKit2 `currentEntitlements` のverified・対象自動更新購読・本人購入・未取消・非置換済みからJWS全体を返します。`AppStore.sync()` は明示的な復元だけです。猶予の有効性・所有者・登録済み購入はAPIが再検証します。
- AndroidはRevenueCatと同じBillingClient 8.3.0でSUBSを照会し、PURCHASEDの対象商品のpurchaseTokenを返します。接続は照会終了・失敗・15秒タイムアウト・モジュール破棄で終了。ブリッジはpurchase/finish/acknowledge/consumeを実装しません。
- RevenueCatはRNPurchases 10.13.0 / PurchasesHybridCommon 19.11.0（iOS 5.95.0 / Android 10.27.0）。APIの `/billing/account` のraw UUIDをappUserIDに設定します。AndroidのBase64(SHA-256(UUID))はSDKに任せます。初回起動や復元候補照会ではRevenueCatを初期化しません。
- 年間商品の表示はAPIの商品一覧とストアのP1Y商品の積集合。価格はストアから取得します。無料体験資格は断定しません。既存active/grace契約がある場合は重複購入を止め、プラン変更はストア管理へ案内します。
- 通常購入はiOS transactionIdentifier / Android purchaseTokenを `/billing/verify` へ送信し、me/subscriptionsを再取得します。CustomerInfoで権利を確定しません。Android token欠落・通信断・保留時は再購入せず、読み取り専用ブリッジの候補を選んで再検証できます。
- 購入開始前にSecureStoreへ「未解決の購入あり」のフラグ（origin/account UUIDのみ）を記録します。取消またはサーバー検証と状態取得の成功まで重複購入を止めます。証明そのものは永続化しません。

## 復元の順序

1. 利用者が復元開始を確認した後だけ、専用のfresh bootstrapを1回行います。既存端末の認証は保持しつつ通常API操作を止め、復元用BearerをSecureStoreに保存します。
2. fresh Bearerで許可商品を取得し、OSから証明を読み取ります。この時点でRevenueCat configure/logIn/restoreを呼びません。複数の候補は選択させ、順次復元・結合はしません。
3. 選択と確認後、復元pendingを保存してから、fresh BearerとJWS全体/purchaseTokenを `/auth/restore` へ送ります。
4. APIが検証して返したtoken/期限/userId/accountTokenを1つのSecureStore envelopeで置き換えます。Query cacheを消去し、画面を再マウントして古い編集状態を破棄します。その後だけ元UUIDにRevenueCatを合わせます。SDKの接続失敗を理由にサーバー復元を再送しません。
5. 通知は設定画面から明示的に再登録します。復元フローとそのロック解除ではチェックインを抑止し、監視の自動再開はありません。

署名/purchaseTokenは画面のメモリと呼出しスタックだけに保持します。候補は背景化・画面離脱・送信時に破棄し、背景化中に届いた候補も採用しません。TanStack mutation変数、ログ、URL、SQLiteに入れません。

## 結果不明時の制限

復元・fresh bootstrapの応答喪失、復元後SecureStore保存失敗はpendingを保持します。旧Bearerの再利用・自動リプレイ・別bootstrapを止めます。構造化された4xx拒否（401を除く）だけはfresh identityを残して利用者の別候補選択を許可します。復元を送信していない、または明確に拒否された場合に限り、開始前の認証が正常だった端末は復元を中止して元のアカウントへ戻れます。

**APIの不足**: 成功した復元の応答を失った端末へ結果を安全に再配布する冪等性/再取得契約はありません。この状態をこのクライアントだけで解除しません。復旧窓口やメールによる補助復旧も未接続です。公開前に契約と利用者案内が必要です。

RevenueCatの購入移転/alias設定は未確定です。コードは復元前の新IDへのrestore/logInを避けますが、SDK初期化時・購入・置換での実ストア挙動はsandbox実機で確認が必要です。通常購入の結果が未解決のまま端末を失う場合、最初の本人verifyがサーバーに登録されていなければ復元を拒否します。

## 検証と次の手順

[最小の外部設定・実機試験](RELEASE-VALIDATION.md) を参照してください。iOSビルドログ `/tmp/deadmans-proof-ios.log`（arm64/x86_64 StoreProof compile・BUILD SUCCEEDED）、Android `/tmp/deadmans-proof-android.log`（StoreProof compile・BUILD SUCCESSFUL、32秒）。iOSホームの起動は成功、今回の購入画面はOSリンク確認の自動操作ができずネイティブ表示未検証です。Web DOMでは未設定表示と操作無効化を確認。画像キャプチャは利用できませんでした。

## 一次資料

- [Expo local modules](https://docs.expo.dev/modules/get-started/)
- [Apple currentEntitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)、[JWS](https://developer.apple.com/documentation/storekit/verificationresult/jwsrepresentation)、[明示的なsync](https://developer.apple.com/documentation/storekit/appstore/sync())
- [Google Play Billingの接続・購入照会](https://developer.android.com/google/play/billing/integrate)
- [RevenueCat React Native](https://www.revenuecat.com/docs/getting-started/installation/reactnative)

新しい署名・認証情報、ストア/RevenueCatコンソール設定、実購入・メール・通知送信は行っていません。
