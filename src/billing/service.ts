import { foregroundAuthority } from "../services/foreground";
import * as SecureStore from "expo-secure-store";
import Purchases, {
  LOG_LEVEL,
  PRODUCT_CATEGORY,
  PURCHASES_ERROR_CODE,
  type PurchasesStoreProduct,
} from "react-native-purchases";
import { AppState, Platform } from "react-native";
import { z } from "zod";
import { apiUrl, mode } from "../api/config";
import { gateway } from "../api/adapter";
import { createLiveGateway } from "../api/live";
import { AppError } from "../api/errors";
import {
  prepareRecovery,
  cancelRecoverySession,
  restoreSession,
  identityRevision,
} from "../api/session";
import { getAppleProofs, getGoogleProofs, proofModuleAvailable } from "../../modules/store-proof";
import { allowedCandidates, completePurchase, type ProofCandidate, type Store } from "./core";
export type { ProofCandidate } from "./core";
export type { PurchasesStoreProduct } from "react-native-purchases";
export const store: Store = Platform.OS === "ios" ? "apple" : "google";
const publicKey =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
// Operator must explicitly enable an already provisioned integration. A public key
// alone must not turn an unfinished deployment into a purchasing environment.
export const billingConfigured =
  mode === "api" &&
  Platform.OS !== "web" &&
  proofModuleAvailable &&
  process.env.EXPO_PUBLIC_BILLING_ENABLED === "1" &&
  !!publicKey &&
  (store === "apple" ? publicKey.startsWith("appl_") : publicKey.startsWith("goog_"));
let active = false;
let screenFocused = false;
export const suppressBillingCheckIn = () => active || screenFocused;
export const setBillingScreenFocused = (focused: boolean) => {
  screenFocused = focused;
};
const assertReady = () => {
  if (!billingConfigured) throw new AppError("BILLING_UNCONFIGURED");
};
const assertForeground = () => {
  if (AppState.currentState !== "active") throw new AppError("BILLING_INTERRUPTED");
};
async function exclusive<T>(operation: (authorize: () => void) => Promise<T>) {
  assertReady();
  assertForeground();
  const generation = foregroundAuthority.current();
  const authorize = () => {
    assertForeground();
    if (!foregroundAuthority.valid(generation)) throw new AppError("BILLING_INTERRUPTED");
  };
  authorize();
  if (active) throw new AppError("BILLING_BUSY");
  active = true;
  try {
    return await operation(authorize);
  } finally {
    active = false;
  }
}
const pendingKey = (accountToken: string) => `purchase-attempt-v1.${accountToken}`;
async function pendingFor(accountToken: string) {
  const value = await SecureStore.getItemAsync(pendingKey(accountToken));
  if (!value) return false;
  const parsed = z
    .object({ origin: z.string(), accountToken: z.string() })
    .safeParse(JSON.parse(value));
  if (!parsed.success) throw new AppError("PURCHASE_UNRESOLVED");
  return parsed.data.origin === apiUrl && parsed.data.accountToken === accountToken;
}
async function clearPending(accountToken: string) {
  if (await pendingFor(accountToken)) await SecureStore.deleteItemAsync(pendingKey(accountToken));
}
async function identify(accountToken: string) {
  z.string().uuid().parse(accountToken);
  Purchases.setLogHandler(() => {}); // Never forward native messages containing receipts/identifiers.
  await Purchases.setLogLevel(LOG_LEVEL.ERROR);
  if (!(await Purchases.isConfigured()))
    Purchases.configure({ apiKey: publicKey!, appUserID: accountToken });
  else if ((await Purchases.getAppUserID()) !== accountToken) await Purchases.logIn(accountToken);
}
function safeStoreError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)
    return new AppError("PURCHASE_CANCELLED");
  if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return new AppError("PURCHASE_PENDING");
  return new AppError("STORE_UNAVAILABLE");
}
export async function loadProducts() {
  return exclusive(async (authorize) => {
    const account = await gateway.billingAccount();
    const ids = Object.keys(account.products[store]);
    if (!ids.length) throw new AppError("BILLING_UNCONFIGURED");
    // Product inspection is also explicit; no SDK configure/identity transfer at app launch.
    authorize();
    await identify(account.accountToken);
    try {
      const products = await Purchases.getProducts(ids, PRODUCT_CATEGORY.SUBSCRIPTION);
      return products.filter(
        (product) =>
          ids.includes(product.identifier.split(":")[0]!) && product.subscriptionPeriod === "P1Y",
      );
    } catch (e) {
      throw safeStoreError(e);
    }
  });
}
export async function buy(product: PurchasesStoreProduct, refresh: () => Promise<void>) {
  return exclusive(async (authorize) => {
    const revision = identityRevision();
    const account = await gateway.billingAccount();
    if (
      !(product.identifier.split(":")[0]! in account.products[store]) ||
      product.subscriptionPeriod !== "P1Y"
    )
      throw new AppError("BILLING_UNCONFIGURED");
    if (await pendingFor(account.accountToken)) throw new AppError("PURCHASE_UNRESOLVED");
    const existing = await gateway.subscriptions();
    if (existing.subscriptions.some((item) => ["active", "grace"].includes(item.status)))
      throw new AppError("SUBSCRIPTION_EXISTS");
    await identify(account.accountToken);
    authorize();
    if (revision !== identityRevision()) throw new AppError("UNAUTHORIZED");
    await SecureStore.setItemAsync(
      pendingKey(account.accountToken),
      JSON.stringify({ origin: apiUrl, accountToken: account.accountToken }),
      {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );
    authorize();
    try {
      await completePurchase(
        {
          purchase: async () => {
            try {
              return (await Purchases.purchaseStoreProduct(product)).transaction;
            } catch (e) {
              throw safeStoreError(e);
            }
          },
          verify: (proof) => gateway.verifyPurchase(proof),
          refresh,
        },
        store,
      );
      await clearPending(account.accountToken);
    } catch (error) {
      if (error instanceof AppError && error.code === "PURCHASE_CANCELLED")
        await clearPending(account.accountToken);
      throw error;
    }
  });
}
async function proofs(ids: string[], sync: boolean): Promise<ProofCandidate[]> {
  try {
    const result: ProofCandidate[] =
      store === "apple"
        ? (await getAppleProofs(ids, sync)).map((item) => ({
            productIds: [item.productId],
            transactionId: item.transactionId,
            proof: {
              store: "apple",
              signedTransaction: item.signedTransaction,
            },
          }))
        : (await getGoogleProofs(ids)).map((item) => ({
            productIds: item.productIds,
            proof: { store: "google", purchaseToken: item.purchaseToken },
          }));
    return allowedCandidates(result, ids, store);
  } catch {
    throw new AppError("STORE_PROOF_UNAVAILABLE");
  }
}
export async function loadExistingProofs(recovery: boolean) {
  return exclusive(async (authorize) => {
    let account;
    if (recovery) {
      const fresh = await prepareRecovery();
      // Never configure/logIn/restore RevenueCat under this temporary identity.
      const api = createLiveGateway(apiUrl!, {
        headers: { Authorization: `Bearer ${fresh.token}` },
        fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      });
      account = await api.billingAccount();
    } else account = await gateway.billingAccount();
    const ids = Object.keys(account.products[store]);
    if (!ids.length) throw new AppError("BILLING_UNCONFIGURED");
    authorize();
    return proofs(ids, recovery);
  });
}
export async function verifyExisting(candidate: ProofCandidate, refresh: () => Promise<void>) {
  return exclusive(async (authorize) => {
    const proof =
      candidate.proof.store === "apple"
        ? {
            store: "apple" as const,
            transactionId: candidate.transactionId ?? "",
          }
        : candidate.proof;
    if (proof.store === "apple" && !/^\d{1,100}$/.test(proof.transactionId))
      throw new AppError("PURCHASE_PROOF_MISSING");
    const account = await gateway.billingAccount();
    authorize();
    await gateway.verifyPurchase(proof);
    await refresh();
    await clearPending(account.accountToken);
  });
}
export async function recover(candidate: ProofCandidate, clearCache: () => Promise<void>) {
  return exclusive(async (authorize) => {
    await clearCache();
    authorize();
    const session = await restoreSession(candidate.proof, authorize);
    await clearCache();
    // Auth recovery already succeeded even if RC identity alignment fails. Never
    // retry server restoration because of an SDK error. No RC restorePurchases call.
    try {
      await identify(session.accountToken!);
      return { revenueCatReady: true };
    } catch {
      return { revenueCatReady: false };
    }
  });
}

export async function cancelRecovery() {
  return exclusive(() => cancelRecoverySession());
}
