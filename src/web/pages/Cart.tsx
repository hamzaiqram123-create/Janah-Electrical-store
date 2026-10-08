import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/ctx";
import { Icon } from "../ui/Icon";
import { Breadcrumbs, Button, Empty, Input, Link, ProductImage, Qty } from "../ui/kit";

export interface CartView {
  id: number | null; count: number; has_issues: boolean;
  items: { item_id: number; product_id: number; slug: string; sku: string; name: string; brand: string | null; image: string | null; glyph: string | null; unit_price: number; list_price: number; quantity: number; available: number; line_total: number; issue: string | null }[];
  coupon: { code: string; valid: boolean; error: string | null; type?: string } | null;
  totals: { items_subtotal: number; discount_total: number; shipping_fee: number | null; cod_fee: number; vat_total: number; total_excl_vat: number; total: number; free_shipping_applied: boolean };
}

export function TotalsBox({ cart, shippingKnown }: { cart: CartView; shippingKnown?: boolean }) {
  const { t, money } = useApp();
  const x = cart.totals;
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between gap-4"><dt className="text-muted">{t("tot.subtotal", { n: cart.count })}</dt><dd className="font-medium tabular-nums">{money(x.items_subtotal)}</dd></div>
      {x.discount_total > 0 && <div className="flex justify-between gap-4 text-ok"><dt>{t("tot.discount")}{cart.coupon?.valid ? ` (${cart.coupon.code})` : ""}</dt><dd className="font-medium tabular-nums" dir="ltr">−{money(x.discount_total)}</dd></div>}
      <div className="flex justify-between gap-4"><dt className="text-muted">{t("tot.shipping")}</dt>
        <dd className="font-medium tabular-nums">{!shippingKnown || x.shipping_fee === null ? <span className="text-muted">{t("tot.shipping_later")}</span> : x.shipping_fee === 0 ? <span className="text-ok">{t("tot.free")}</span> : money(x.shipping_fee)}</dd></div>
      {x.cod_fee > 0 && <div className="flex justify-between gap-4"><dt className="text-muted">{t("tot.cod_fee")}</dt><dd className="font-medium tabular-nums">{money(x.cod_fee)}</dd></div>}
      <div className="flex justify-between gap-4 border-t border-line pt-3 text-base"><dt className="font-bold">{t("tot.total")}</dt><dd className="price text-xl">{money(x.total)}</dd></div>
      <div className="flex justify-between gap-4 text-xs text-muted"><dt>{t("tot.vat_included")}</dt><dd className="tabular-nums">{money(x.vat_total)}</dd></div>
    </dl>
  );
}

export function CouponBox({ cart, onCart }: { cart: CartView; onCart: (c: CartView) => void }) {
  const app = useApp();
  const { t } = app;
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const call = async (method: "POST" | "DELETE") => {
    setBusy(true);
    try {
      const r = await api<{ cart: CartView }>("/api/cart/coupon", method === "POST" ? { body: { code } } : { method });
      onCart(r.cart); setCode("");
      if (method === "POST") app.toast(t("coupon.applied"));
    } catch (e) { app.toast(app.errorText(e), "err"); } finally { setBusy(false); }
  };
  if (cart.coupon) {
    return (
      <div className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${cart.coupon.valid ? "border-ok/40 bg-ok-soft" : "border-danger/40 bg-danger-soft"}`}>
        <span className="flex items-center gap-2"><Icon name="tag" size={16} /><b dir="ltr">{cart.coupon.code}</b>
          {cart.coupon.valid ? (cart.coupon.type === "free_shipping" ? t("coupon.free_shipping") : t("coupon.active")) : t(`err.${cart.coupon.error}`)}</span>
        <button type="button" className="font-semibold underline" disabled={busy} onClick={() => call("DELETE")}>{t("c.remove")}</button>
      </div>
    );
  }
  return (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void call("POST"); }}>
      <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t("coupon.placeholder")} aria-label={t("coupon.placeholder")} dir="ltr" className="h-10 text-start uppercase" maxLength={40} />
      <Button type="submit" variant="outline" size="sm" className="h-10" busy={busy} disabled={!code.trim()}>{t("coupon.apply")}</Button>
    </form>
  );
}

export default function CartPage() {
  const app = useApp();
  const { t, money } = app;
  const [cart, setCart] = useState<CartView>(app.data.cart);
  const [busyId, setBusyId] = useState<number | null>(null);
  const update = (c: CartView) => { setCart(c); app.setCartCount(c.count); };

  // Abandoned-cart e-mail links land here with ?recover=<token>
  useEffect(() => {
    const token = app.query.get("recover");
    if (!token) return;
    api("/api/cart/recover", { body: { token } }).then(() => app.navigate(app.href("/cart"), { replace: true })).catch(() => {});
  }, []);

  const setQty = async (productId: number, quantity: number) => {
    setBusyId(productId);
    try { update((await api<{ cart: CartView }>(`/api/cart/items/${productId}`, { method: "PATCH", body: { quantity } })).cart); }
    catch (e) { app.toast(app.errorText(e), "err"); }
    finally { setBusyId(null); }
  };

  if (!cart.items.length) {
    return (
      <div className="container-x py-6">
        <Empty icon="cart" title={t("cart.empty")} text={t("cart.empty_text")}>
          <Link to="/products" className="btn btn-primary btn-md">{t("cart.start")}</Link>
        </Empty>
      </div>
    );
  }
  return (
    <div className="container-x py-5 md:py-7">
      <Breadcrumbs items={[{ name: t("cart.title") }]} />
      <h1 className="h-page mb-5">{t("cart.title")} <span className="text-base font-normal text-muted">({t("cart.items_n", { n: cart.count })})</span></h1>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ul className="card divide-y divide-line">
          {cart.items.map((it) => {
            const dead = it.issue === "out_of_stock" || it.issue === "unavailable";
            return (
              <li key={it.item_id} className={`flex gap-3 p-3 md:gap-4 md:p-4 ${dead ? "bg-surface-2" : ""}`}>
                <Link to={`/p/${it.slug}`} className="size-20 shrink-0 overflow-hidden rounded-md border border-line bg-white md:size-24" tabIndex={-1} aria-hidden="true">
                  <ProductImage src={it.image} alt="" glyph={it.glyph} className={dead ? "opacity-50" : ""} />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {it.brand && <span className="text-xs text-muted">{it.brand}</span>}
                      <h2 className="leading-snug font-medium"><Link to={`/p/${it.slug}`} className="line-clamp-2 hover:text-accent">{it.name}</Link></h2>
                      <p className="text-xs text-muted tabular-nums" dir="ltr">{it.sku}</p>
                    </div>
                    <button type="button" className="icon-btn -me-2 -mt-1 text-muted hover:text-danger" disabled={busyId === it.product_id} onClick={() => setQty(it.product_id, 0)} aria-label={t("cart.remove_x", { name: it.name })}><Icon name="trash" size={18} /></button>
                  </div>
                  {it.issue && (
                    <p className={`flex items-center gap-1.5 text-sm font-medium ${dead ? "text-danger" : "text-warn"}`}><Icon name="alert" size={15} />
                      {t(`cart.issue_${it.issue}`, { n: it.available })}</p>
                  )}
                  <div className="mt-auto flex flex-wrap items-end justify-between gap-3">
                    {dead ? <span /> : <Qty small value={it.quantity} max={Math.max(1, it.available)} disabled={busyId === it.product_id} onChange={(n) => setQty(it.product_id, n)} />}
                    <div className="text-end">
                      {!dead && <p className="price text-lg">{money(it.line_total)}</p>}
                      <p className="text-xs text-muted tabular-nums">{t("cart.each", { price: money(it.unit_price) })}</p>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="h-fit space-y-4 lg:sticky lg:top-4">
          <div className="card space-y-4 p-4">
            <h2 className="text-lg font-bold">{t("cart.summary")}</h2>
            <CouponBox cart={cart} onCart={update} />
            <TotalsBox cart={cart} />
            {cart.has_issues && <p className="rounded-md bg-warn-soft p-3 text-sm">{t("cart.has_issues")}</p>}
            <Link to="/checkout" className="btn btn-primary btn-lg w-full" aria-disabled={cart.count === 0}>{t("cart.checkout")}<Icon name="arrow" size={18} /></Link>
            <Link to="/products" className="block text-center text-sm font-semibold text-accent hover:underline">{t("cart.continue")}</Link>
          </div>
          {app.shell.settings.online_payment && <p className="flex items-center gap-2 px-1 text-sm text-muted"><Icon name="lock" size={16} />{t("cart.secure")}</p>}
        </aside>
      </div>
    </div>
  );
}
