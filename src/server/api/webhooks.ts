import { db } from "../db";
import { log, errMeta } from "../logger";
import { readJson, type Router } from "../http";
import { loadOrder, syncPayment } from "../services/orders";
import { onlineGateway } from "../services/payments/gateway";

export function registerWebhooks(r: Router) {
  /**
   * Gateway → server notification. The body is only used to find the payment reference;
   * the real state is always re-fetched from the gateway API with our secret key, so a forged call cannot mark an order paid.
   */
  r.post("/api/webhooks/:provider", async (c) => {
    const gw = onlineGateway();
    if (!gw || gw.id !== c.params.provider) return new Response("unknown provider", { status: 404 });
    const ref = gw.parseWebhook(await readJson(c.req).catch(() => null));
    if (ref) {
      const pay = await db.one<{ id: number }>(`SELECT id FROM payments WHERE provider = $1 AND gateway_id = $2`, [gw.id, ref]);
      if (pay) await syncPayment(pay.id).catch((e) => log.error("webhook sync failed", { ref, ...errMeta(e) }));
    }
    return { received: true };
  }, { csrf: false, rate: "write" });

  /** Customer returns here from the hosted payment page. */
  r.get("/pay/return", async (c) => {
    const order = await loadOrder({ number: c.query.get("order") ?? "" });
    if (!order || order.access_key !== c.query.get("key")) return new Response(null, { status: 302, headers: { location: `/${c.lang}` } });
    const pay = await db.one<{ id: number }>(`SELECT id FROM payments WHERE order_id = $1 ORDER BY id DESC LIMIT 1`, [order.id]);
    if (pay) await syncPayment(pay.id).catch((e) => log.error("return sync failed", { order: order.number, ...errMeta(e) }));
    return new Response(null, { status: 303, headers: { location: `/${order.locale}/order/${order.number}?key=${order.access_key}` } });
  });
}
