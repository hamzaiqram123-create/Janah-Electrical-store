import type { CheckoutSession, GatewayPaymentState, GatewayStatus, PaymentGateway } from "./gateway";

/**
 * Moyasar (https://moyasar.com) hosted invoices: mada, Visa/Mastercard, Apple Pay and STC Pay,
 * depending on what is activated on the merchant account.
 * Docs: https://docs.moyasar.com/api/invoices/01-create-invoice
 */
export class MoyasarGateway implements PaymentGateway {
  readonly id = "moyasar";
  readonly methods = ["mada", "visa", "mastercard", "applepay", "stcpay"];
  private auth: string;

  constructor(secretKey: string, private base: string) {
    this.auth = "Basic " + Buffer.from(`${secretKey}:`).toString("base64");
  }

  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { authorization: this.auth, "content-type": "application/json", accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Moyasar ${method} ${path} failed: ${res.status} ${(data as any)?.message ?? ""}`);
    return data;
  }

  async createCheckout(input: Parameters<PaymentGateway["createCheckout"]>[0]): Promise<CheckoutSession> {
    const inv = await this.call("POST", "/invoices", {
      amount: input.amount,
      currency: "SAR",
      description: input.description,
      callback_url: input.callbackUrl,
      success_url: input.successUrl,
      back_url: input.backUrl,
      expired_at: input.expiresAt.toISOString(),
    });
    return { gatewayId: inv.id, url: inv.url, raw: sanitize(inv) };
  }

  async fetchState(gatewayId: string): Promise<GatewayPaymentState> {
    const inv = await this.call("GET", `/invoices/${encodeURIComponent(gatewayId)}`);
    const paid = (inv.payments ?? []).find((p: any) => p.status === "paid" || p.status === "captured");
    const map: Record<string, GatewayStatus> = { paid: "paid", initiated: "pending", on_hold: "pending", failed: "failed", canceled: "failed", voided: "failed", expired: "expired", refunded: "refunded" };
    return {
      status: map[inv.status] ?? "pending",
      amount: Number(inv.amount),
      currency: String(inv.currency),
      paymentId: paid?.id ?? null,
      method: paid?.source?.company ?? paid?.source?.type ?? null,
      raw: sanitize(inv),
    };
  }

  async refund(paymentId: string, amount: number) {
    const res = await this.call("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, { amount });
    return { raw: { id: res.id, status: res.status, refunded: res.refunded } };
  }

  parseWebhook(body: unknown): string | null {
    const b = body as any;
    const id = b?.id ?? b?.data?.invoice_id ?? b?.data?.id;
    return typeof id === "string" && id.length < 100 ? id : null;
  }
}

/** Keep only what is needed for reconciliation; card details are reduced to scheme + last four digits. */
function sanitize(inv: any): Record<string, unknown> {
  return {
    id: inv.id, status: inv.status, amount: inv.amount, currency: inv.currency, created_at: inv.created_at,
    payments: (inv.payments ?? []).map((p: any) => ({
      id: p.id, status: p.status, amount: p.amount, fee: p.fee, refunded: p.refunded,
      source: p.source ? { type: p.source.type, company: p.source.company, last4: typeof p.source.number === "string" ? p.source.number.slice(-4) : undefined, message: p.source.message } : undefined,
    })),
  };
}
