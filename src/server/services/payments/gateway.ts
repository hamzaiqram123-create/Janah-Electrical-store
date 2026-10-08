import { config } from "../../config";
import { MoyasarGateway } from "./moyasar";

export type GatewayStatus = "paid" | "pending" | "failed" | "expired" | "refunded";

export interface CheckoutSession { gatewayId: string; url: string; raw: Record<string, unknown> }
export interface GatewayPaymentState {
  status: GatewayStatus;
  amount: number;            // halalas
  currency: string;
  paymentId: string | null;  // id of the successful charge, needed for refunds
  method: string | null;     // mada | creditcard | applepay | stcpay …
  raw: Record<string, unknown>; // sanitised — never contains full card numbers
}

/**
 * Hosted-checkout payment gateway contract. The customer always enters card / wallet details on the
 * gateway's own page, so card data never touches this server (keeps the shop out of PCI-DSS scope).
 * To add another Saudi gateway (HyperPay, Tap, PayTabs, Tabby …) implement this interface and register it below.
 */
export interface PaymentGateway {
  readonly id: string;
  /** Wallets / card schemes shown to the customer as badges. */
  readonly methods: string[];
  createCheckout(input: { orderNumber: string; amount: number; description: string; successUrl: string; backUrl: string; callbackUrl: string; expiresAt: Date }): Promise<CheckoutSession>;
  fetchState(gatewayId: string): Promise<GatewayPaymentState>;
  refund(paymentId: string, amount: number): Promise<{ raw: Record<string, unknown> }>;
  /** Extracts the gateway reference from a webhook body. The state is always re-fetched from the API, never trusted from the body. */
  parseWebhook(body: unknown): string | null;
}

let gateway: PaymentGateway | null | undefined;
export function onlineGateway(): PaymentGateway | null {
  if (gateway !== undefined) return gateway;
  gateway = config.PAYMENT_PROVIDER === "moyasar" && config.MOYASAR_SECRET_KEY
    ? new MoyasarGateway(config.MOYASAR_SECRET_KEY, config.MOYASAR_API_BASE)
    : null;
  return gateway;
}
