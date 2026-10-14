import { AppError } from "../api/errors.ts";
import type { RestoreProof } from "../api/session-core.ts";
import type { PurchaseProof } from "../api/live.ts";
export type Store = "apple" | "google";
export type ProofCandidate = {
  productIds: string[];
  transactionId?: string;
  proof: RestoreProof;
};
export function purchaseProof(
  store: Store,
  transaction: { transactionIdentifier: string; purchaseToken?: string | null },
): PurchaseProof {
  if (store === "apple" && /^\d{1,100}$/.test(transaction.transactionIdentifier))
    return { store, transactionId: transaction.transactionIdentifier };
  if (
    store === "google" &&
    transaction.purchaseToken &&
    transaction.purchaseToken.length >= 10 &&
    transaction.purchaseToken.length <= 4096
  )
    return { store, purchaseToken: transaction.purchaseToken };
  throw new AppError("PURCHASE_PROOF_MISSING");
}
export function allowedCandidates(candidates: ProofCandidate[], allowed: string[], store: Store) {
  return candidates.filter(
    (candidate) =>
      candidate.proof.store === store && candidate.productIds.some((id) => allowed.includes(id)),
  );
}
export async function completePurchase(
  deps: {
    purchase(): Promise<{
      transactionIdentifier: string;
      purchaseToken?: string | null;
    }>;
    verify(proof: PurchaseProof): Promise<void>;
    refresh(): Promise<void>;
  },
  store: Store,
) {
  const transaction = await deps.purchase();
  await deps.verify(purchaseProof(store, transaction));
  await deps.refresh();
}
