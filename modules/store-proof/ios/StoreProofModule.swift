import ExpoModulesCore
import StoreKit

public class StoreProofModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StoreProof")
    AsyncFunction("getAppleProofs") { (productIds: [String], sync: Bool) async throws -> [[String: String]] in
      guard !productIds.isEmpty, productIds.count <= 20 else { return [] }
      if sync { try await AppStore.sync() }
      var proofs: [[String: String]] = []
      for await result in Transaction.currentEntitlements {
        guard case .verified(let transaction) = result,
              productIds.contains(transaction.productID),
              transaction.productType == .autoRenewable,
              transaction.ownershipType == .purchased,
              transaction.revocationDate == nil,
              !transaction.isUpgraded else { continue }
        // currentEntitlements also includes grace-period entitlements. The server
        // checks current status/expiry, appAccountToken and registered ownership.
        proofs.append([
          "productId": transaction.productID,
          "transactionId": String(transaction.id),
          "signedTransaction": result.jwsRepresentation
        ])
      }
      return proofs
    }
  }
}
