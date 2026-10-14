import { requireOptionalNativeModule } from "expo-modules-core";
import { z } from "zod";
const appleSchema = z.array(
  z.object({
    productId: z.string(),
    transactionId: z.string().regex(/^\d+$/),
    signedTransaction: z.string().min(100).max(100000),
  }),
);
const googleSchema = z.array(
  z.object({
    productIds: z.array(z.string()),
    purchaseToken: z.string().min(10).max(4096),
  }),
);
interface NativeProof {
  getAppleProofs(productIds: string[], sync: boolean): Promise<unknown>;
  getGoogleProofs(productIds: string[]): Promise<unknown>;
}
const native = requireOptionalNativeModule<NativeProof>("StoreProof");
export const proofModuleAvailable = !!native;
export async function getAppleProofs(productIds: string[], sync: boolean) {
  if (!native) throw new Error("STORE_PROOF_UNAVAILABLE");
  return appleSchema.parse(await native.getAppleProofs(productIds, sync));
}
export async function getGoogleProofs(productIds: string[]) {
  if (!native) throw new Error("STORE_PROOF_UNAVAILABLE");
  return googleSchema.parse(await native.getGoogleProofs(productIds));
}
