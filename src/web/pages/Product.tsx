import { useEffect, useRef, useState } from "react";
import { vatPortion } from "../../shared/pricing";
import { api } from "../lib/api";
import { rememberViewed, useCartActions, useWishlist } from "../lib/actions";
import { useApp } from "../lib/ctx";
import { ProductGrid, RatingPlate, RecentlyViewed, SectionHead, type Card } from "../parts/Product";
import { Icon } from "../ui/Icon";
import { Badge, Breadcrumbs, Button, Field, Input, Link, Modal, Price, ProductImage, Qty, Stars, Textarea, useForm } from "../ui/kit";

function Gallery({ images, name, glyph }: { images: { url: string; thumb_url: string; alt: string }[]; name: string; glyph: string | null }) {
  const { t } = useApp();
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  const cur = images[idx];
  const step = (d: number) => setIdx((i) => (i + d + images.length) % images.length);
  return (
    <div>
      <div className="card relative aspect-square overflow-hidden bg-white">
        {cur ? (
          <button type="button" className="block size-full cursor-zoom-in" aria-label={t("p.zoom")} onClick={() => setOpen(true)}
            onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}
            onMouseLeave={() => setZoom(null)}>
            <img src={cur.url} alt={cur.alt || name} className="size-full object-contain transition-transform duration-150"
              style={zoom ? { transform: "scale(2.2)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined} />
          </button>
        ) : <ProductImage alt={name} glyph={glyph} eager />}
        {images.length > 1 && <span className="absolute end-3 bottom-3 rounded bg-fg/75 px-2 py-0.5 text-xs text-bg tabular-nums" dir="ltr">{idx + 1} / {images.length}</span>}
      </div>
      {images.length > 1 && (
        <ul className="scroll-x mt-3">
          {images.map((im, i) => (
            <li key={i} className="shrink-0 snap-start">
              <button type="button" onClick={() => setIdx(i)} aria-label={t("p.image_n", { n: i + 1 })} aria-current={i === idx ? "true" : undefined}
                className={`block size-[72px] overflow-hidden rounded-md border-2 bg-white ${i === idx ? "border-accent" : "border-line hover:border-fg"}`}>
                <img src={im.thumb_url} alt="" loading="lazy" className="size-full object-contain" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={name} wide>
        {cur && (
          <div className="relative">
            <img src={cur.url} alt={cur.alt || name} className="mx-auto max-h-[72dvh] w-auto object-contain" />
            {images.length > 1 && (
              <>
                <button type="button" className="icon-btn absolute start-0 top-1/2 -translate-y-1/2 bg-surface/90" onClick={() => step(-1)} aria-label={t("c.prev")}><Icon name="chev" className="rotate-180" /></button>
                <button type="button" className="icon-btn absolute end-0 top-1/2 -translate-y-1/2 bg-surface/90" onClick={() => step(1)} aria-label={t("c.next")}><Icon name="chev" /></button>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Video({ url, title }: { url: string; title: string }) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  const src = yt ? `https://www.youtube-nocookie.com/embed/${yt[1]}` : vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
  return (
    <div className="card aspect-video overflow-hidden bg-black">
      {src ? <iframe src={src} title={title} loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" className="size-full" />
        : <video src={url} controls preload="metadata" className="size-full" />}
    </div>
  );
}

function Reviews({ p }: { p: any }) {
  const app = useApp();
  const { t } = app;
  const [open, setOpen] = useState(false);
  const form = useForm({ rating: 5, title: "", body: "" });
  const total = p.rating_hist.reduce((s: number, h: any) => s + h.count, 0);
  const submit = () => form.submit(async (v) => {
    const r = await api<{ status: string }>(`/api/products/${p.id}/reviews`, { body: v });
    app.toast(t(r.status === "approved" ? "rev.published" : "rev.pending"));
    setOpen(false);
    if (r.status === "approved") void app.reload();
  }, (e) => app.toast(app.errorText(e), "err"));
  return (
    <section id="reviews" className="mt-10">
      <SectionHead title={t("rev.title")} />
      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <div className="card h-fit p-5">
          {total > 0 ? (
            <>
              <p className="flex items-baseline gap-2"><span className="text-4xl font-bold tabular-nums">{p.rating_avg.toFixed(1)}</span><span className="text-muted">/ 5</span></p>
              <Stars value={p.rating_avg} size={18} className="mt-1" />
              <p className="mt-1 text-sm text-muted">{t("rev.count", { n: total })}</p>
              <ul className="mt-4 space-y-1.5">
                {p.rating_hist.map((h: any) => (
                  <li key={h.stars} className="flex items-center gap-2 text-xs text-muted">
                    <span className="w-3 tabular-nums">{h.stars}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-warn" style={{ width: `${(h.count / total) * 100}%` }} /></span>
                    <span className="w-6 text-end tabular-nums">{h.count}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="text-muted">{t("rev.none")}</p>}
          {app.shell.user
            ? <Button variant="outline" className="mt-5 w-full" icon="edit" onClick={() => setOpen(true)}>{t("rev.write")}</Button>
            : <Link to={`/login?next=${encodeURIComponent(app.route.path)}`} className="btn btn-outline btn-md mt-5 w-full">{t("rev.login_to_write")}</Link>}
        </div>
        <ul className="space-y-3">
          {p.reviews.map((r: any) => (
            <li key={r.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars value={r.rating} />
                <span className="font-semibold">{r.author}</span>
                {r.verified_purchase && <Badge tone="ok"><Icon name="check" size={12} />{t("rev.verified")}</Badge>}
                <time className="ms-auto text-xs text-muted" dateTime={r.created_at}>{app.date(r.created_at)}</time>
              </div>
              {r.title && <p className="mt-2 font-semibold">{r.title}</p>}
              {r.body && <p className="mt-1 whitespace-pre-line text-muted">{r.body}</p>}
            </li>
          ))}
        </ul>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={t("rev.write")}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">{t("rev.your_rating")}</legend>
            <div className="flex gap-1" dir="ltr">
              {[1, 2, 3, 4, 5].map((n) => (
                <button type="button" key={n} onClick={() => form.set("rating", n)} aria-label={t("p.rating_of", { n })} aria-pressed={form.values.rating === n}
                  className={`grid size-10 place-items-center rounded-md ${form.values.rating >= n ? "text-warn" : "text-muted/50"}`}>
                  <svg viewBox="0 0 24 24" width="28" height="28" fill={form.values.rating >= n ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.500" strokeLinejoin="round"><path d="m12 3 2.700 5.600 6.100.800-4.500 4.300 1.100 6.100L12 16.900 6.600 19.800l1.100-6.100L3.200 9.400l6.100-.800L12 3Z" /></svg>
                </button>
              ))}
            </div>
          </fieldset>
          <Field label={t("rev.f_title")} error={form.errors.title}><Input {...form.bind("title")} maxLength={120} /></Field>
          <Field label={t("rev.f_body")} error={form.errors.body}><Textarea {...form.bind("body")} maxLength={2000} /></Field>
          <Button type="submit" busy={form.busy} className="w-full">{t("rev.submit")}</Button>
        </form>
      </Modal>
    </section>
  );
}

export default function ProductPage() {
  const app = useApp();
  const { t, money } = app;
  const p = app.data.product;
  const cart = useCartActions();
  const wish = useWishlist();
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState<"" | "add" | "buy" | "all">("");
  const [tab, setTab] = useState<"desc" | "specs">("specs");
  const buyRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => { rememberViewed(p.id); }, [p.id]);
  useEffect(() => {
    const el = buyRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setPinned(!e!.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const add = async (mode: "add" | "buy") => {
    setBusy(mode);
    const ok = await cart.add(p.id, qty, mode === "buy");
    setBusy("");
    if (ok && mode === "buy") void app.navigate(app.href("/checkout"));
  };
  const addAll = async () => {
    setBusy("all");
    let ok = await cart.add(p.id, 1, true);
    for (const x of p.together as Card[]) if (ok) ok = await cart.add(x.id, 1, true);
    setBusy("");
    if (ok) app.toast(t("cart.added_n", { n: p.together.length + 1 }));
  };
  const vat = vatPortion(p.price, p.vat_rate_bp);
  const wished = wish.has(p.id);
  const specs = [
    ...p.specs,
    ...(p.warranty_months ? [{ label: t("p.warranty"), value: t("p.months", { n: p.warranty_months }) }] : []),
    ...(p.weight_g ? [{ label: t("p.weight"), value: p.weight_g >= 1000 ? `${(p.weight_g / 1000).toFixed(2)} kg` : `${p.weight_g} g` }] : []),
    ...(p.dimensions_mm ? [{ label: t("p.dimensions"), value: `${p.dimensions_mm.join(" × ")} mm` }] : []),
    { label: t("p.sku"), value: p.sku },
    ...(p.barcode ? [{ label: t("p.barcode"), value: p.barcode }] : []),
  ];
  const togetherTotal = p.price + (p.together as Card[]).reduce((s, x) => s + x.price, 0);

  return (
    <div className="container-x py-5 md:py-7">
      <Breadcrumbs items={[...p.breadcrumbs.map((b: any) => ({ name: b.name, to: `/c/${b.slug}` })), { name: p.name }]} />
      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        <div className="space-y-4">
          <Gallery images={p.images} name={p.name} glyph={p.glyph} />
          {p.video_url && <Video url={p.video_url} title={p.name} />}
        </div>

        <div>
          {p.brand && <Link to={`/brand/${p.brand_slug}`} className="text-sm font-semibold text-accent hover:underline">{p.brand}</Link>}
          <h1 className="mt-1 text-2xl leading-snug font-bold md:text-[1.7rem]">{p.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span>{t("p.sku")}: <span className="text-fg tabular-nums" dir="ltr">{p.sku}</span></span>
            {p.rating_count > 0
              ? <a href="#reviews" className="flex items-center gap-1.5 hover:text-fg"><Stars value={p.rating_avg} /><span className="tabular-nums">{p.rating_avg.toFixed(1)} ({p.rating_count})</span></a>
              : <a href="#reviews" className="hover:text-fg">{t("rev.none_short")}</a>}
          </div>
          {p.plate.length > 0 && <div className="mt-3"><RatingPlate values={p.plate} large /></div>}

          <div className="mt-5 border-y border-line py-4" ref={buyRef}>
            <div className="flex flex-wrap items-center gap-3">
              <Price price={p.price} list={p.list_price} size="lg" />
              {p.discount_pct > 0 && <span className="badge badge-deal" dir="ltr">−{p.discount_pct}%</span>}
            </div>
            <p className="mt-1 text-sm text-muted">{t("p.vat_included", { rate: p.vat_rate_bp / 100, vat: money(vat) })}</p>
            <p className="mt-3 flex items-center gap-2 font-semibold">
              {p.in_stock
                ? <><span className="size-2.5 rounded-full bg-ok" /><span className="text-ok">{p.stock_left != null ? t("p.stock_left", { n: p.stock_left }) : t("p.in_stock")}</span></>
                : <><span className="size-2.5 rounded-full bg-danger" /><span className="text-danger">{t("p.out_of_stock")}</span></>}
            </p>
            {p.in_stock && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Qty value={qty} max={Math.max(1, p.max_qty)} onChange={setQty} />
                <Button icon="cart" busy={busy === "add"} disabled={!!busy} className="min-w-44 flex-1 sm:flex-none" onClick={() => add("add")}>{t("p.add_to_cart")}</Button>
                <Button variant="dark" busy={busy === "buy"} disabled={!!busy} className="min-w-36 flex-1 sm:flex-none" onClick={() => add("buy")}>{t("p.buy_now")}</Button>
              </div>
            )}
            <button type="button" onClick={() => wish.toggle(p.id)} aria-pressed={wished} className={`mt-4 flex items-center gap-2 text-sm font-semibold ${wished ? "text-danger" : "text-muted hover:text-fg"}`}>
              <Icon name="heart" size={18} />{t(wished ? "wish.remove" : "wish.add")}
            </button>
          </div>

          <ul className="mt-4 space-y-2.5 text-sm">
            <li className="flex items-start gap-2.5"><Icon name="truck" size={18} className="mt-0.5 text-muted" />{t("p.note_delivery")}</li>
            <li className="flex items-start gap-2.5"><Icon name="undo" size={18} className="mt-0.5 text-muted" /><span>{t("p.note_returns")} <Link to="/page/returns" className="text-accent hover:underline">{t("c.details")}</Link></span></li>
            {p.warranty_months > 0 && <li className="flex items-start gap-2.5"><Icon name="shield" size={18} className="mt-0.5 text-muted" />{t("p.note_warranty", { n: p.warranty_months })}</li>}
            <li className="flex items-start gap-2.5"><Icon name="receipt" size={18} className="mt-0.5 text-muted" />{t("p.note_invoice")}</li>
          </ul>
        </div>
      </div>

      <section className="mt-10">
        <div className="flex gap-2 border-b border-line" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "specs"} className={`tab ${tab === "specs" ? "tab-on" : ""}`} onClick={() => setTab("specs")}>{t("p.specs")}</button>
          <button type="button" role="tab" aria-selected={tab === "desc"} className={`tab ${tab === "desc" ? "tab-on" : ""}`} onClick={() => setTab("desc")}>{t("p.description")}</button>
        </div>
        <div className="card mt-4 overflow-hidden" role="tabpanel">
          {tab === "specs" ? (
            <table className="w-full text-sm">
              <tbody>
                {specs.map((s: any, i: number) => (
                  <tr key={i} className="border-b border-line last:border-0 odd:bg-surface-2/60">
                    <th scope="row" className="w-2/5 px-4 py-2.5 text-start font-medium text-muted md:w-1/3">{s.label}</th>
                    <td className="px-4 py-2.5 font-medium"><bdi>{s.value}</bdi></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="max-w-[75ch] p-5 leading-8 whitespace-pre-line">{p.description || t("p.no_description")}</p>}
        </div>
      </section>

      {p.together.length > 0 && p.in_stock && (
        <section className="mt-10">
          <SectionHead title={t("p.together")} />
          <div className="card flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
            <ul className="flex flex-1 flex-wrap items-center gap-3">
              {[{ ...p, self: true }, ...p.together].map((x: any, i: number) => (
                <li key={x.id} className="flex items-center gap-3">
                  {i > 0 && <Icon name="plus" size={18} className="text-muted" />}
                  <Link to={`/p/${x.slug}`} className="flex w-56 items-center gap-3 rounded-md border border-line p-2 hover:border-fg">
                    <span className="size-14 shrink-0 overflow-hidden rounded bg-white"><ProductImage src={x.image} alt="" glyph={x.glyph} /></span>
                    <span className="min-w-0"><span className="line-clamp-2 text-[13px] leading-snug">{x.name}</span><span className="price text-sm">{money(x.price)}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="shrink-0 lg:text-end">
              <p className="text-sm text-muted">{t("p.together_total")}</p>
              <p className="price text-xl">{money(togetherTotal)}</p>
              <Button className="mt-2" icon="cart" busy={busy === "all"} disabled={!!busy} onClick={addAll}>{t("p.add_all")}</Button>
            </div>
          </div>
        </section>
      )}

      <Reviews p={p} />

      {p.related.length > 0 && (
        <section className="mt-10">
          <SectionHead title={t("p.related")} />
          <ProductGrid items={p.related.slice(0, 5)} />
        </section>
      )}
      <div className="-mx-4 md:-mx-6"><RecentlyViewed excludeId={p.id} /></div>

      {p.in_stock && pinned && (
        <div className="no-print fixed inset-x-0 bottom-[58px] z-30 flex items-center gap-3 border-t border-line bg-surface px-4 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,.08)] md:hidden">
          <span className="price flex-1 text-lg">{money(p.price)}</span>
          <Button icon="cart" busy={busy === "add"} disabled={!!busy} onClick={() => add("add")}>{t("p.add_to_cart")}</Button>
        </div>
      )}
    </div>
  );
}
