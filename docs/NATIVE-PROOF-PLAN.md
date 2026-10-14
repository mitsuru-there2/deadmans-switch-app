# 購入証明ブリッジとクライアント連携

2026-10-14。API `45dc01e` の `docs/app-contract.md` に対応。コードとローカルモック、iOS/Android development buildを検証済み。実ストアでの証明取得・購入・復元は未実施です。

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

## 復元結果の再取得

送信前にOSの暗号学的乱数32bytesを生成し、paddingなしBase64URL 43文字のoperationSecretにします。API origin・元のfresh Bearer・操作秘密・pendingを1つのSecureStore envelopeに保存してから送信します。保存に失敗すれば送信しません。購入証明は永続化しません。同じfresh Bearerでの別秘密/別証明への変更は行いません。

応答喪失・最終SecureStore切替失敗・アプリ再起動後は「送信した復元の結果を確認」から `/auth/restore/result` を呼びます。元fresh Bearerと保存済みoperationSecretだけを送り、購入証明の再送や再購入はしません。結果確認にはRevenueCatキーやnative proof moduleを要求しないため、ストア設定が不足していても保存済み結果は照合できます。自動ポーリングはしません。

- completed: サーバーが返す同じsession全体をSecureStoreへ保存して、元fresh Bearer・操作秘密を消去。その後に画面/cacheを破棄しRevenueCatを元UUIDへ合わせます。再発行・device-session更新・チェックイン・見守り再開・通知登録は行いません。
- pending: 未完了のまま通常APIを止めます。本文やストア証明は再送せず、利用者による結果確認を待ちます。
- failed: 拒否された同じ操作は再開せず、別候補へ差し替えません。
- 404/期限切れ/失効: 復元が未実行とは扱わず、通常APIを止めます。結果期限はサーバー受付から最大15分で、確認しても延長されません。外側expiresAtとsession.expiresAtを別扱いにし、端末時計だけで可否を確定しません。

別の復元を始めたい場合は、明示確認を挟んで **元fresh Bearer** で `DELETE /auth/device-sessions` を送ります。204または401を確認した後だけ元認証・秘密を消去し「放棄済み」にします。通信不明では停止を保ち、次の明示操作で同じ失効操作を確認します。放棄後の新bootstrap/OS証明/操作秘密生成は、別の利用者操作で開始します。旧Bearerに戻りません。非同期処理は直列化し、保存された元fresh Bearer・操作秘密・操作状態を照合して旧操作から遅れて届いた応答を破棄します。

fresh bootstrap自体の応答喪失は再取得対象外です。送信前SecureStore保存失敗も結果再取得が保証されません。保存済み秘密がない場合、旧認証の再利用や勝手な新bootstrapで回避しません。未送信と確定できる認可失効だけは元のready状態へ戻します。

API migration `0008_pink_shen.sql` が必要です。新しいサーバーキー・環境変数は不要。今回の実装は既存コード/モックのみで、稼働DB・ストア設定は変更していません。RevenueCatの購入移転/alias設定、実機sandboxでの所有者・署名・置換購入の挙動は引き続き確認が必要です。

## 検証と次の手順

[最小の外部設定・実機試験](RELEASE-VALIDATION.md) を参照してください。iOSビルドログ `/tmp/deadmans-proof-ios.log`（arm64/x86_64 StoreProof compile・BUILD SUCCEEDED）、Android `/tmp/deadmans-proof-android.log`（StoreProof compile・BUILD SUCCESSFUL、32秒）。iOSホームの起動は成功、今回の購入画面はOSリンク確認の自動操作ができずネイティブ表示未検証です。Web DOMでは未設定表示と操作無効化を確認。画像キャプチャは利用できませんでした。

## 一次資料

- [Expo local modules](https://docs.expo.dev/modules/get-started/)
- [Apple currentEntitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)、[JWS](https://developer.apple.com/documentation/storekit/verificationresult/jwsrepresentation)、[明示的なsync](https://developer.apple.com/documentation/storekit/appstore/sync())
- [Google Play Billingの接続・購入照会](https://developer.android.com/google/play/billing/integrate)
- [RevenueCat React Native](https://www.revenuecat.com/docs/getting-started/installation/reactnative)

新しい署名・認証情報、ストア/RevenueCatコンソール設定、実購入・メール・通知送信は行っていません。
