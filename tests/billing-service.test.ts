import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { loader } = createRequire(import.meta.url)("./review-harness.cjs");
const uuid = "11111111-1111-4111-8111-111111111111";
function service(configured: boolean) {
  const events: string[] = [];
  const values = new Map<string, string>();
  const state = {
    pending: false,
    cancelled: false,
    loseResponse: false,
    missingToken: false,
  };
  let configuredSDK = false;
  const product = { identifier: "annual", subscriptionPeriod: "P1Y" };
  const account = {
    accountToken: uuid,
    products: { apple: {}, google: { annual: "basic" } },
  };
  const sdk = {
    setLogHandler() {},
    setLogLevel: async () => {},
    isConfigured: async () => configuredSDK,
    configure: (input: { appUserID: string }) => {
      assert.equal(input.appUserID, uuid);
      events.push("configure");
      configuredSDK = true;
    },
    getAppUserID: async () => uuid,
    logIn: async () => {
      events.push("login");
    },
    getProducts: async () => [product],
    purchaseStoreProduct: async () => {
      events.push("purchase");
      if (state.pending) throw { code: "pending" };
      if (state.cancelled) throw { code: "cancelled" };
      return {
        transaction: {
          transactionIdentifier: "ORDER_NOT_PROOF",
          purchaseToken: state.missingToken ? null : "OS_PURCHASE_TOKEN",
        },
        customerInfo: { ignored: true },
      };
    },
    restorePurchases: async () => {
      throw new Error("must not use RC restoration");
    },
  };
  const mocks = {
    "../services/foreground": {
      foregroundAuthority: { current: () => 1, valid: () => true },
    },
    "expo-secure-store": {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      getItemAsync: async (key: string) => values.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => {
        values.set(key, value);
      },
      deleteItemAsync: async (key: string) => {
        values.delete(key);
      },
    },
    "react-native-purchases": {
      __esModule: true,
      default: sdk,
      LOG_LEVEL: { ERROR: "error" },
      PRODUCT_CATEGORY: { SUBSCRIPTION: "subs" },
      PURCHASES_ERROR_CODE: {
        PURCHASE_CANCELLED_ERROR: "cancelled",
        PAYMENT_PENDING_ERROR: "pending",
      },
    },
    "react-native": {
      Platform: { OS: "android" },
      AppState: { currentState: "active" },
    },
    "../api/config": { apiUrl: "https://mock.invalid", mode: "api" },
    "../api/adapter": {
      gateway: {
        billingAccount: async () => account,
        subscriptions: async () => ({ subscriptions: [] }),
        verifyPurchase: async (proof: unknown) => {
          events.push("verify");
          assert.deepEqual(JSON.parse(JSON.stringify(proof)), {
            store: "google",
            purchaseToken: "OS_PURCHASE_TOKEN",
          });
          if (state.loseResponse) throw new Error("lost");
        },
      },
    },
    "../api/live": {
      createLiveGateway: () => ({
        billingAccount: async () => {
          events.push("fresh-account");
          return account;
        },
      }),
    },
    "../api/session": {
      identityRevision: () => 0,
      prepareRecovery: async () => {
        events.push("fresh-bootstrap");
        return { token: "MOCK_FRESH" };
      },
      restoreSession: async (proof: unknown) => {
        events.push("server-restore");
        assert.deepEqual(JSON.parse(JSON.stringify(proof)), {
          store: "google",
          purchaseToken: "OS_PURCHASE_TOKEN",
        });
        return { accountToken: uuid };
      },
    },
    "../../modules/store-proof": {
      proofModuleAvailable: true,
      getGoogleProofs: async () => {
        events.push("OS-proof");
        return [{ productIds: ["annual"], purchaseToken: "OS_PURCHASE_TOKEN" }];
      },
    },
  };
  const load = loader(mocks, {
    process: {
      env: configured
        ? {
            EXPO_PUBLIC_BILLING_ENABLED: "1",
            EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: "goog_LOCAL_MOCK",
          }
        : {},
    },
  });
  return {
    api: load("src/billing/service.ts"),
    events,
    product,
    state,
    values,
  };
}
test("missing configuration starts no store, bootstrap, purchase or restoration", async () => {
  const f = service(false);
  assert.equal(f.api.billingConfigured, false);
  await assert.rejects(f.api.loadProducts(), /BILLING_UNCONFIGURED/);
  await assert.rejects(f.api.loadExistingProofs(true), /BILLING_UNCONFIGURED/);
  await assert.rejects(
    f.api.buy(f.product, async () => {}),
    /BILLING_UNCONFIGURED/,
  );
  assert.deepEqual(f.events, []);
});
test("OS recovery proof reaches the server before RevenueCat identity is configured", async () => {
  const f = service(true);
  const candidates = await f.api.loadExistingProofs(true);
  assert.deepEqual(f.events, ["fresh-bootstrap", "fresh-account", "OS-proof"]);
  await f.api.recover(candidates[0], async () => {
    f.events.push("clear-cache");
  });
  assert.deepEqual(f.events, [
    "fresh-bootstrap",
    "fresh-account",
    "OS-proof",
    "clear-cache",
    "server-restore",
    "clear-cache",
    "configure",
  ]);
});
test("pending or unknown purchases persist a nonsecret latch and block duplicate purchases", async () => {
  for (const outcome of ["pending", "loseResponse", "missingToken"] as const) {
    const f = service(true);
    f.state[outcome] = true;
    await assert.rejects(
      f.api.buy(f.product, async () => {
        throw new Error("must not refresh");
      }),
    );
    await assert.rejects(
      f.api.buy(f.product, async () => {}),
      /PURCHASE_UNRESOLVED/,
    );
    assert.equal(f.events.filter((e) => e === "purchase").length, 1);
    assert.ok([...f.values.values()].every((value) => !value.includes("OS_PURCHASE_TOKEN")));
  }
});
test("cancelled purchase clears latch; normal success verifies and refreshes before clearing", async () => {
  const f = service(true);
  f.state.cancelled = true;
  await assert.rejects(
    f.api.buy(f.product, async () => {}),
    /PURCHASE_CANCELLED/,
  );
  assert.equal(f.values.size, 0);
  f.state.cancelled = false;
  await f.api.buy(f.product, async () => {
    f.events.push("refresh");
  });
  assert.equal(f.values.size, 0);
  assert.deepEqual(f.events.slice(-3), ["purchase", "verify", "refresh"]);
});
