import { createApiClient } from "deadmans-switch-api/client";
import {
  billingAccountSchema,
  entitlementSchema,
  subscriptionsResponseSchema,
  type BillingAccount,
  type SubscriptionsResponse,
  currentConsentSchema,
  deliveriesResponseSchema,
  devicesResponseSchema,
  selfTestResponseSchema,
  type Delivery,
} from "deadmans-switch-api/responses";
import { z } from "zod";
import { AppError } from "./errors.ts";
import {
  meSchema,
  recipientSchema,
  messageSchema,
  type Me,
  type Recipient,
  type Message,
  type MessageInput,
  type RecipientInput,
} from "../domain/models.ts";
export type PurchaseProof =
  { store: "apple"; transactionId: string } | { store: "google"; purchaseToken: string };
export interface Gateway {
  billingAccount(): Promise<BillingAccount>;
  subscriptions(): Promise<SubscriptionsResponse>;
  verifyPurchase(proof: PurchaseProof): Promise<void>;
  requestContact(input: RecipientInput): Promise<void>;
  confirmContact(token: string): Promise<void>;
  invite(id: string): Promise<void>;
  deliveries(): Promise<Delivery[]>;
  selfTest(): Promise<{ queued: true; deliveryId: string }>;
  activate(version: number, consentVersion: string): Promise<void>;
  devices(): Promise<{ id: string; createdAt: number }[]>;
  registerDevice(token: string): Promise<{ id: string }>;
  removeDevice(id: string): Promise<void>;
  me(): Promise<Me>;
  recipients(): Promise<Recipient[]>;
  messages(): Promise<Message[]>;
  addRecipient(input: RecipientInput, version: number): Promise<void>;
  removeRecipient(id: string, version: number): Promise<void>;
  saveMessage(id: string, input: MessageInput, version: number): Promise<{ version: number }>;
  settings(inactivityDays: number, graceDays: number, version: number): Promise<void>;
  checkIn(kind: "foreground" | "notification_action", authorizeSend: () => void): Promise<void>;
  pause(): Promise<void>;
  consent(): Promise<{
    version: string;
    language: "ja";
    effectiveAt: number;
    title: string;
    body: string;
  }>;
}
async function decode(request: Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>) {
  const response = await request;
  if (!response.ok) {
    const body = z
      .object({ error: z.object({ code: z.string() }) })
      .safeParse(await response.json().catch(() => null));
    throw new AppError(
      response.status === 401 ? "UNAUTHORIZED" : body.success ? body.data.error.code : "NETWORK",
    );
  }
  return response.status === 204 ? undefined : (response.json() as Promise<unknown>);
}
export function createLiveGateway(
  baseUrl: string,
  options: Parameters<typeof createApiClient>[1],
): Gateway {
  const rpc = createApiClient(baseUrl, options);
  return {
    billingAccount: async () =>
      billingAccountSchema.parse(await decode(rpc.v1.billing.account.$get())),
    subscriptions: async () =>
      subscriptionsResponseSchema.parse(await decode(rpc.v1.billing.subscriptions.$get())),
    verifyPurchase: async (proof) => {
      z.union([entitlementSchema, z.object({ received: z.literal(true) }).strict()]).parse(
        await decode(rpc.v1.billing.verify.$post({ json: proof })),
      );
    },
    requestContact: async (input) => {
      await decode(rpc.v1["contact-email"].$post({ json: input }));
    },
    confirmContact: async (token) => {
      await decode(rpc.v1["contact-email"].confirm.$post({ json: { token } }));
    },
    invite: async (id) => {
      await decode(rpc.v1.recipients[":id"].invite.$post({ param: { id } }));
    },
    deliveries: async () =>
      deliveriesResponseSchema.parse(await decode(rpc.v1.deliveries.$get())).deliveries,
    selfTest: async () => selfTestResponseSchema.parse(await decode(rpc.v1["self-test"].$post())),
    activate: async (version, consentVersion) => {
      await decode(
        rpc.v1.switch.activate.$post({
          json: { version, consentVersion, confirmed: true },
        }),
      );
    },
    devices: async () => devicesResponseSchema.parse(await decode(rpc.v1.devices.$get())).devices,
    registerDevice: async (token) =>
      z.object({ id: z.string() }).parse(await decode(rpc.v1.devices.$post({ json: { token } }))),
    removeDevice: async (id) => {
      await decode(rpc.v1.devices[":id"].$delete({ param: { id } }));
    },
    me: async () => meSchema.parse(await decode(rpc.v1.me.$get())),
    recipients: async () =>
      z
        .object({ recipients: z.array(recipientSchema) })
        .parse(await decode(rpc.v1.recipients.$get())).recipients,
    messages: async () =>
      z.object({ messages: z.array(messageSchema) }).parse(await decode(rpc.v1.messages.$get()))
        .messages,
    addRecipient: async (input, version) => {
      await decode(
        rpc.v1.recipients.$post({
          json: { ...input, channel: "email", version },
        }),
      );
    },
    removeRecipient: async (id, version) => {
      await decode(rpc.v1.recipients[":id"].$delete({ param: { id }, json: { version } }));
    },
    saveMessage: async (id, input, version) => {
      return z.object({ version: z.number().int().positive() }).parse(
        await decode(
          rpc.v1.recipients[":id"].message.$put({
            param: { id },
            json: { ...input, version },
          }),
        ),
      );
    },
    settings: async (inactivityDays, graceDays, version) => {
      await decode(rpc.v1.switch.$patch({ json: { inactivityDays, graceDays, version } }));
    },
    checkIn: async (kind, authorizeSend) => {
      await decode(
        rpc.v1["check-ins"].$post(
          { json: { kind } },
          {
            fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
              authorizeSend();
              return (options?.fetch ?? fetch)(input, init);
            },
          },
        ),
      );
    },
    pause: async () => {
      await decode(rpc.v1.switch.pause.$post());
    },
    consent: async () => currentConsentSchema.parse(await decode(rpc.v1.consents.current.$get())),
  };
}
