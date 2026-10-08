import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { recentlyViewed, useCartActions, useWishlist } from "../lib/actions";
import { useApp } from "../lib/ctx";
import { Icon } from "../ui/Icon";
import { Button, Link, Price, ProductImage, Stars } from "../ui/kit";

export interface Card {
  id: number; slug: string; sku: string; name: string; brand: string | null; brand_slug: string | null; image: string | null;
  price: number; list_price: number; discount_pct: number; rating_avg: number; rating_count: number;
  is_new: boolean; is_best_seller: boolean; in_stock: boolean; low_stock: boolean; glyph: string | null; plate: string[];
}

/** Key ratings printed like the plate on the device itself: 16A | 250V | IP44 */
export function RatingPlate({ values, large }: { values: string[]; large?: boolean }) {
  if (!values.length) return null;
  return <span className={`rating-plate ${large ? "rating-plate-lg" : ""}`}>{values.map((v, i) => <span key={i}>{v}</span>)}</span>;
}

export function ProductCard({ p }: { p: Card }) {
  const { t } = useApp();
  const cart = useCartActions();
  const wish = useWishlist();
  const [busy, setBusy] = useState(false);
  const wished = wish.has(p.id);
  return (
    <article className="card group relative flex h-full flex-col overflow-hidden">
      <Link to={`/p/${p.slug}`} className="relative block aspect-square overflow-hidden bg-white" tabIndex={-1} aria-hidden="true">
        <ProductImage src={p.image} alt="" glyph={p.glyph} className={p.in_stock ? "" : "opacity-55"} />
        <span className="absolute start-2 top-2 flex flex-col items-start gap-1">
          {p.discount_pct > 0 && <span className="badge badge-deal" dir="ltr">−{p.discount_pct}%</span>}
          {p.is_new && <span className="badge badge-info">{t("p.new")}</span>}
        </span>
        {!p.in_stock && <span className="absolute inset-x-0 bottom-0 bg-fg/85 py-1 text-center text-xs font-semibold text-bg">{t("p.out_of_stock")}</span>}
      </Link>
      <button type="button" onClick={() => wish.toggle(p.id)} aria-pressed={wished} aria-label={t(wished ? "wish.remove" : "wish.add")}
        className={`absolute end-2 top-2 grid size-9 place-items-center rounded-full border border-line bg-surface/95 ${wished ? "text-danger" : "text-muted hover:text-fg"}`}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill={wished ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.800" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7-4.400-7-10a4 4 0 0 1 7-2.600A4 4 0 0 1 19 10c0 5.600-7 10-7 10Z" /></svg>
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {p.brand && <span className="text-xs text-muted">{p.brand}</span>}
        <h3 className="text-[14px] leading-snug font-medium">
          <Link to={`/p/${p.slug}`} className="line-clamp-2 min-h-[2.75em] hover:text-accent">{p.name}</Link>
        </h3>
        <RatingPlate values={p.plate} />
        {p.rating_count > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted"><Stars value={p.rating_avg} size={13} /><span className="tabular-nums">({p.rating_count})</span></span>
        )}
        <div className="mt-auto pt-1.5"><Price price={p.price} list={p.list_price} /></div>
        <Button variant={p.in_stock ? "outline" : "ghost"} size="sm" icon={p.in_stock ? "cart" : undefined} disabled={!p.in_stock} busy={busy} className="mt-1 w-full"
          onClick={async () => { setBusy(true); await cart.add(p.id, 1); setBusy(false); }}>
          {p.in_stock ? t("p.add_to_cart") : t("p.unavailable")}
        </Button>
      </div>
    </article>
  );
}

export function ProductGrid({ items, dense }: { items: Card[]; dense?: boolean }) {
  return (
    <ul className={`grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 ${dense ? "lg:grid-cols-4" : "lg:grid-cols-4 xl:grid-cols-5"}`}>
      {items.map((p) => <li key={p.id}><ProductCard p={p} /></li>)}
    </ul>
  );
}

export function SectionHead({ title, to, more }: { title: string; to?: string; more?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="text-xl font-bold md:text-2xl">{title}</h2>
      {to && <Link to={to} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-accent hover:underline">{more}<Icon name="chev" size={14} /></Link>}
    </div>
  );
}

/** "Recently viewed" strip — read from this browser's storage after hydration. */
export function RecentlyViewed({ excludeId }: { excludeId?: number }) {
  const { t } = useApp();
  const [items, setItems] = useState<Card[]>([]);
  useEffect(() => {
    const ids = recentlyViewed().filter((id) => id !== excludeId).slice(0, 10);
    if (!ids.length) return;
    api<{ items: Card[] }>(`/api/products/by-ids?ids=${ids.join(",")}`).then((r) => setItems(r.items)).catch(() => {});
  }, [excludeId]);
  if (!items.length) return null;
  return (
    <section className="container-x mt-12">
      <SectionHead title={t("home.recent")} />
      <ProductGrid items={items.slice(0, 5)} />
    </section>
  );
}
