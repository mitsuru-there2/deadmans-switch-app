package jp.example.storeproof

import android.os.Handler
import android.os.Looper
import com.android.billingclient.api.*
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StoreProofModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private var active: BillingClient? = null
  private var cancel: (() -> Unit)? = null

  override fun definition() = ModuleDefinition {
    Name("StoreProof")
    AsyncFunction("getGoogleProofs") { productIds: List<String>, promise: Promise ->
      handler.post {
        val context = appContext.reactContext
        if (active != null || context == null || productIds.isEmpty() || productIds.size > 20) {
          promise.reject("STORE_PROOF_UNAVAILABLE", "Store proof is unavailable", null)
          return@post
        }
        var finished = false
        var timeout: Runnable? = null
        val client = BillingClient.newBuilder(context)
          .setListener { _, _ -> /* Read-only: RevenueCat owns purchase handling. */ }
          .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
          .build()
        active = client
        fun complete(value: List<Map<String, Any>>?) {
          if (finished) return
          finished = true
          timeout?.let { handler.removeCallbacks(it) }
          client.endConnection()
          active = null
          cancel = null
          if (value == null) promise.reject("STORE_PROOF_UNAVAILABLE", "Store proof is unavailable", null)
          else promise.resolve(value)
        }
        cancel = { complete(null) }
        timeout = Runnable { complete(null) }
        handler.postDelayed(timeout!!, 15000)
        client.startConnection(object : BillingClientStateListener {
          override fun onBillingServiceDisconnected() { handler.post { complete(null) } }
          override fun onBillingSetupFinished(result: BillingResult) {
            handler.post {
              if (finished) return@post
              if (result.responseCode != BillingClient.BillingResponseCode.OK) { complete(null); return@post }
              client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()
              ) { response, purchases ->
                handler.post {
                  if (response.responseCode != BillingClient.BillingResponseCode.OK) complete(null)
                  else complete(purchases.filter {
                    it.purchaseState == Purchase.PurchaseState.PURCHASED &&
                      it.products.any { id -> productIds.contains(id) } && it.purchaseToken.isNotBlank()
                  }.map { mapOf("productIds" to it.products, "purchaseToken" to it.purchaseToken) })
                }
              }
            }
          }
        })
      }
    }
    OnDestroy { handler.post { cancel?.invoke() } }
  }
}
