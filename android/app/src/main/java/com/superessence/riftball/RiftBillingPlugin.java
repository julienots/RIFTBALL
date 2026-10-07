package com.superessence.riftball;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Google Play Billing bridge for RIFTBALL.
 * The plugin NEVER grants anything: it only returns store purchases (token + signed payload) to JS.
 * JS sends them to the server for validation, grants, then calls finish() to acknowledge/consume.
 */
@CapacitorPlugin(name = "RiftBilling")
public class RiftBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient client;
    private final Map<String, ProductDetails> details = new HashMap<>();
    private PluginCall pendingPurchaseCall;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build();
    }

    private void ensureConnected(Runnable onReady, PluginCall call) {
        if (client.isReady()) { onReady.run(); return; }
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) onReady.run();
                else if (call != null) {
                    JSObject o = new JSObject();
                    o.put("connected", false);
                    o.put("status", "billing_unavailable");
                    o.put("message", r.getDebugMessage());
                    call.resolve(o);
                }
            }
            @Override public void onBillingServiceDisconnected() { /* reconnect lazily on next call */ }
        });
    }

    @PluginMethod
    public void connect(PluginCall call) {
        ensureConnected(() -> { JSObject o = new JSObject(); o.put("connected", true); call.resolve(o); }, call);
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        JSArray ids = call.getArray("ids");
        ensureConnected(() -> {
            List<QueryProductDetailsParams.Product> list = new ArrayList<>();
            try {
                for (int i = 0; i < ids.length(); i++) {
                    list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(ids.getString(i)).setProductType(BillingClient.ProductType.INAPP).build());
                }
            } catch (JSONException e) { call.reject("bad ids"); return; }
            client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(list).build(), (r, result) -> {
                JSArray out = new JSArray();
                if (result != null) for (ProductDetails d : result) {
                    details.put(d.getProductId(), d);
                    JSObject p = new JSObject();
                    p.put("id", d.getProductId());
                    p.put("title", d.getName());
                    ProductDetails.OneTimePurchaseOfferDetails offer = d.getOneTimePurchaseOfferDetails();
                    p.put("price", offer != null ? offer.getFormattedPrice() : "");
                    out.put(p);
                }
                JSObject o = new JSObject();
                o.put("products", out);
                call.resolve(o);
            });
        }, call);
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        ensureConnected(() -> {
            ProductDetails d = details.get(productId);
            if (d == null) { resolveStatus(call, "unavailable", "Produit introuvable"); return; }
            if (pendingPurchaseCall != null) { resolveStatus(call, "error", "Achat déjà en cours"); return; }
            List<BillingFlowParams.ProductDetailsParams> p = new ArrayList<>();
            p.add(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).build());
            pendingPurchaseCall = call;
            call.setKeepAlive(true);
            BillingResult r = client.launchBillingFlow(getActivity(), BillingFlowParams.newBuilder().setProductDetailsParamsList(p).build());
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                PluginCall c = pendingPurchaseCall; pendingPurchaseCall = null;
                c.setKeepAlive(false);
                resolveStatus(c, mapCode(r.getResponseCode()), r.getDebugMessage());
            }
        }, call);
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;
        if (call == null) return;
        call.setKeepAlive(false);
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null && !purchases.isEmpty()) {
            Purchase p = purchases.get(0);
            JSObject o = new JSObject();
            o.put("status", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased" : "pending");
            o.put("purchase", toJs(p));
            call.resolve(o);
        } else {
            resolveStatus(call, mapCode(code), r.getDebugMessage());
        }
    }

    @PluginMethod
    public void queryPurchases(PluginCall call) {
        ensureConnected(() -> client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(), (r, list) -> {
            JSArray out = new JSArray();
            if (list != null) for (Purchase p : list) out.put(toJs(p));
            JSObject o = new JSObject();
            o.put("purchases", out);
            call.resolve(o);
        }), call);
    }

    @PluginMethod
    public void finish(PluginCall call) {
        String token = call.getString("purchaseToken");
        boolean consumable = Boolean.TRUE.equals(call.getBoolean("consumable", false));
        ensureConnected(() -> {
            if (consumable) {
                client.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(token).build(), (r, t) -> done(call, r));
            } else {
                client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build(), r -> done(call, r));
            }
        }, call);
    }

    private void done(PluginCall call, BillingResult r) {
        JSObject o = new JSObject();
        o.put("ok", r.getResponseCode() == BillingClient.BillingResponseCode.OK);
        call.resolve(o);
    }

    private JSObject toJs(Purchase p) {
        JSObject o = new JSObject();
        o.put("orderId", p.getOrderId() != null ? p.getOrderId() : p.getPurchaseToken());
        o.put("productId", p.getProducts().isEmpty() ? "" : p.getProducts().get(0));
        o.put("purchaseToken", p.getPurchaseToken());
        o.put("purchaseTime", p.getPurchaseTime());
        o.put("acknowledged", p.isAcknowledged());
        o.put("state", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased" : "pending");
        o.put("originalJson", p.getOriginalJson());
        o.put("signature", p.getSignature());
        return o;
    }

    private void resolveStatus(PluginCall call, String status, String message) {
        JSObject o = new JSObject();
        o.put("status", status);
        o.put("message", message);
        call.resolve(o);
    }

    private String mapCode(int code) {
        switch (code) {
            case BillingClient.BillingResponseCode.USER_CANCELED: return "cancelled";
            case BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED: return "already_owned";
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE: return "unavailable";
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE:
            case BillingClient.BillingResponseCode.NETWORK_ERROR:
            case BillingClient.BillingResponseCode.SERVICE_DISCONNECTED: return "network";
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE:
            case BillingClient.BillingResponseCode.FEATURE_NOT_SUPPORTED: return "billing_unavailable";
            default: return "error";
        }
    }
}
