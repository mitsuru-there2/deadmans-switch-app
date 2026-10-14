# 公開前の最小設定・検証手順

2026-10-14。コードのローカル検証と、以下の外部設定・実機試験を分けます。ここに記載したストア設定・実購入・配信は今回実施していません。

## 利用者・運用担当が行う設定は3段階

1. **APIを準備**: 既存の接続先をAPI `45dc01e` 以降へ更新し、既存手順でmigration `0008_pink_shen.sql` を適用。アプリの `EXPO_PUBLIC_API_URL` を指定します。結果再取得のための新しい秘密キーは不要です。まず検証環境で行います。
2. **ストアとRevenueCatを対応付け**: 登録済みbundle ID/package、basic/plusの年間商品、API `STORE_PRODUCTS`、RevenueCatの商品を一致させます。移転/alias方針を確認後、OS別公開SDKキーと `EXPO_PUBLIC_BILLING_ENABLED=1` を設定します。
3. **実機dev buildで確認**: 既存の署名・通知設定を使ってビルドし、承認済みsandboxで購入→本人verify→別端末復元→応答喪失から「送信した復元の結果を確認」を試験。復元後の通知は設定画面から手動再登録します。具体的な失敗ケースは以下を使います。

今回、これらの外部設定・稼働DB更新・実購入・実通知は実施していません。

## 既存設定を用意する

1. 本登録済みのiOS bundle ID / Android packageへapp.jsonの開発仮値を置き換えます。APIのストア検証設定と、両ストアの年間basic/plus商品、RevenueCatのアプリ・同じ商品を対応させます。API `STORE_PRODUCTS` の一覧を `/billing/account` と照合します。Androidの基本プランは年次P1Yにします。
2. RevenueCatの購入移転/alias方針を決定します。既存APIが所有者を検証する保証を緩めず、SDKだけで別アカウントへ移転しない設定と実挙動を確認します。Webhooksを権利付与元へ追加しません。
3. 既存の公開SDKキーを `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` に設定し、API URLを設定します。両者の準備ができてから `EXPO_PUBLIC_BILLING_ENABLED=1` を指定します。秘密キーはEXPO_PUBLICへ入れません。未設定・demo・Web・native module欠落では購入/復元を開始しません。
4. 通知試験には既存EAS projectId、APNs/FCM credentials、実機dev buildが必要です。Universal Links/App Linksは許可ドメインと関連付けファイルが未設定です。現在のメール確認はリンクの手動貼付です。
5. Node >=22.15 / npm11、隣接APIリポジトリを用意し `npm ci` → `npm run typecheck` → `npm test` → `npx expo prebuild`。iOSはpod install、AndroidはSDK36/Java17でdevelopment buildを作成します。Expo Goでは動きません。generated `/ios` `/android` は除外、`modules/store-proof/ios` `/android` はソース管理対象です。

## ストアsandboxの実機で確認する

実購入を実行してよい承認と専用sandboxアカウントを別途用意してから行います。JWS/purchaseToken/Bearerをログやスクリーンショットへ残さず、成否と非秘密の状態だけを記録します。

1. 未購入のテスト本人Aでプランを表示。ストアの年額、無料体験の資格、更新条件を確認して購入。iOS appAccountToken＝API UUID、Android obfuscatedAccountId＝Base64(SHA-256(UUID))をサーバー検証で照合します。API verify成功前に利用可能・見守り有効と表示しないことを確認。
2. 取消、支払い保留、ストア応答喪失、verify応答喪失、API一時障害を試験。再購入が止まり「購入済み・結果不明の購入を再確認」から同じ購入を確認できること。Android purchaseToken null時も注文番号を代用しないこと。
3. Aで本人verify済みの購読を用意し、新端末で同じストアから復元。OSの証明→サーバー検証→SecureStore切替→キャッシュ・編集画面破棄→RevenueCatの元UUIDの順を確認。旧端末のBearerが401、旧通知登録が消去、元データ取得が成功すること。最後のチェックイン・監視状態が復元だけで変わらないこと。
4. 未登録購入、家族共有、失効/取消、不正署名、保留、別所有者候補、複数候補を試験。拒否または明示的な1件選択となり、勝手な統合・順次復元がないこと。Apple無料体験/猶予、Android置換購入と多段linked referenceはAPI `e087a7a` の条件を維持すること。
5. 復元応答喪失・復元後のSecureStore保存失敗を試験。旧Bearerへ戻らず、アプリ再起動後もpendingで止まること。「送信した復元の結果を確認」で同じ新Bearerが取得でき、期限が延びないこと。pending/failed/404/期限切れでは操作を停止。やり直しは元fresh Bearerの204/401失効確認後のみ。fresh bootstrapの応答喪失は本再取得の対象外です。
6. 復元後、通知を手動再登録。拒否・トークン更新・5端末上限・解除を確認。通知受信やバックグラウンドでチェックインしないこと。設定変更・端末認証・通信待ち中の背景化も確認。

## 残る端末確認

- iOS/Android: 全画面のVoiceOver/TalkBack、文字拡大、キーボード、戻る操作、画面ロック/スクリーンショット防止、通知拒否。
- SQLCipher: Android実機の保存・プロセス再起動・鍵失効、iOSのバックアップ除外、OSバックアップ/再インストール後の読込拒否と未同期下書き案内。iOS Simulatorの保存/再起動/鍵喪失拒否は検証済み。
- ネイティブ購入画面の実表示・ストアシート遷移、Androidエミュレータ/実機操作は未検証。iOSのOSリンク確認はAX取得エラーで自動操作できませんでした。
- 本人メール変更、補助メール復旧、通知アクション、アカウントexport/削除は未接続。既存active/grace契約のアプリ内アップグレード/ダウングレード購入は重複購入防止のため提供していません。

## これまでの検証証拠

- API `e087a7a` を読み取り、共有型とHono Clientを使用。外部ネットワークを呼ばないモックで購入・復元の順序と失敗分岐を検証。
- 主要フロー独立レビュー3件の修正は `8417655`。固定したコミット対象の型検査と16テストが成功。後続購入試験を含む全テストの結果はHANDOFFを参照。
- iOS: `/tmp/deadmans-proof-ios.log`、StoreProof arm64/x86_64 compile、BUILD SUCCEEDED。既存Simulator用ローカル署名だけを使用。
- Android: `/tmp/deadmans-proof-android.log`、BUILD SUCCESSFUL。APK `android/app/build/outputs/apk/debug/app-debug.apk`。
- 全プラットフォームbundle: `/tmp/deadmans-proof-export`。Web DOMで未設定表示と購入/復元ボタン無効を確認。
- 依存監査はhigh19件（修正版のない開発ツール由来）。詳細は[DEPENDENCY-AUDIT.md](DEPENDENCY-AUDIT.md)。


## 復元結果再取得の今回検証

API `45dc01e` の共有Hono Client / RestoreResultResponseを使用。アプリの型検査、39件のローカルテスト、3プラットフォームexportを検証。通常成功、応答喪失、最終Keychain書込失敗、再起動、pending/failed/404、期限非延長、放棄の通信不明・204/401、遅延応答破棄を含みます。コードはTS/TSXだけの変更で、既存expo-cryptoを使用しnative module・依存・native設定は変更していないため、今回のnative再ビルドは不要と判断しました。実機の新しい画面操作は未検証です。ログ `/tmp/deadmans-restore-result-tests.log`、bundle `/tmp/deadmans-restore-result-export`。
