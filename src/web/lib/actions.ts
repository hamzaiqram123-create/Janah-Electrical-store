import { useEffect, useState } from "react";
import { api } from "./api";
import { useApp } from "./ctx";

export function useCartActions() {
  const app = useApp();
  return {
    /** Adds to the cart and updates the header counter. Returns the fresh cart, or null when the server refused (e.g. not enough stock). */
    async add(productId: number, quantity = 1, silent = false) {
      try {
        const r = await api<{ cart: any }>("/api/cart/items", { body: { product_id: productId, quantity } });
        app.setCartCount(r.cart.count);
        if (!silent) app.toast(app.t("cart.added"));
        return r.cart;
      } catch (e) {
        app.toast(app.errorText(e), "err");
        return null;
      }
    },
  };
}

// ── wishlist (signed-in customers); one shared copy per browser tab
let wishIds: Set<number> | null = null;
let wishOwner: number | null = null;
let wishLoading = false;
const wishSubs = new Set<() => void>();
const emit = () => wishSubs.forEach((f) => f());

export function useWishlist() {
  const app = useApp();
  const [, force] = useState(0);
  const userId = app.shell.user?.id ?? null;
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    wishSubs.add(cb);
    if (wishOwner !== userId) { wishIds = null; wishOwner = userId; emit(); }
    if (userId && !wishIds && !wishLoading) {
      wishLoading = true;
      api<{ ids: number[] }>("/api/account/wishlist").then((r) => { wishIds = new Set(r.ids); emit(); }).catch(() => {}).finally(() => { wishLoading = false; });
    }
    return () => { wishSubs.delete(cb); };
  }, [userId]);
  return {
    has: (id: number) => !!wishIds?.has(id),
    count: wishIds?.size ?? 0,
    async toggle(id: number) {
      if (!userId) {
        app.toast(app.t("wish.login_first"));
        void app.navigate(app.href(`/login?next=${encodeURIComponent(location.pathname + location.search)}`));
        return;
      }
      const on = !!wishIds?.has(id);
      try {
        if (on) await api(`/api/account/wishlist/${id}`, { method: "DELETE" });
        else await api("/api/account/wishlist", { body: { product_id: id } });
        wishIds ??= new Set();
        if (on) wishIds.delete(id); else wishIds.add(id);
        emit();
        app.toast(app.t(on ? "wish.removed" : "wish.added"));
      } catch (e) {
        app.toast(app.errorText(e), "err");
      }
    },
  };
}

// ── recently viewed products (kept in this browser only)
const RV_KEY = "rv";
export function recentlyViewed(): number[] {
  try { return (JSON.parse(localStorage.getItem(RV_KEY) ?? "[]") as number[]).filter((n) => Number.isInteger(n)).slice(0, 12); } catch { return []; }
}
export function rememberViewed(id: number) {
  try { localStorage.setItem(RV_KEY, JSON.stringify([id, ...recentlyViewed().filter((x) => x !== id)].slice(0, 12))); } catch { /* storage unavailable */ }
}
