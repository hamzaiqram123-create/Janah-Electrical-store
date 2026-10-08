import { useState } from "react";
import { useApp, type CategoryNode } from "../lib/ctx";
import { ProductGrid } from "../parts/Product";
import { Glyph } from "../ui/Icon";
import { Breadcrumbs, Button, Empty, Link, Modal, Pagination, Select, Stars } from "../ui/kit";

function findNode(nodes: CategoryNode[], slug: string): CategoryNode | null {
  for (const n of nodes) {
    if (n.slug === slug) return n;
    const hit = findNode(n.children, slug);
    if (hit) return hit;
  }
  return null;
}

export default function Listing() {
  const app = useApp();
  const { t, data, query, route, lang } = app;
  const [sheet, setSheet] = useState(false);
  const strip = (p: string) => p.replace(new RegExp(`^/${lang}`), "") || "/";
  const crumbs = ((data.crumbs ?? []) as { name: string; path: string }[]).map((c) => ({ name: c.name, to: strip(c.path) }));

  const setParams = (patch: Record<string, string | null>) => {
    const q = new URLSearchParams(route.search);
    q.delete("page");
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === "") q.delete(k); else q.set(k, v); }
    const qs = q.toString();
    void app.navigate(`${route.path}${qs ? `?${qs}` : ""}`);
  };
  const selectedBrands = (query.get("brand") ?? "").split(",").filter(Boolean);
  const toggleBrand = (slug: string) => {
    const next = selectedBrands.includes(slug) ? selectedBrands.filter((s) => s !== slug) : [...selectedBrands, slug];
    setParams({ brand: next.join(",") || null });
  };
  const activeCount = ["brand", "min", "max", "in_stock", "rating"].filter((k) => query.get(k)).length;
  const node = data.category ? findNode(app.shell.categories, data.category.slug) : null;
  const facets = data.facets ?? { brands: [], price_min: 0, price_max: 0 };

  function Filters() {
    const [min, setMin] = useState(query.get("min") ?? "");
    const [max, setMax] = useState(query.get("max") ?? "");
    return (
      <div className="space-y-6">
        <fieldset>
          <legend className="mb-2 font-bold">{t("f.availability")}</legend>
          <label className="flex items-center gap-2.5 py-1">
            <input type="checkbox" className="check" checked={query.get("in_stock") === "1"} onChange={(e) => setParams({ in_stock: e.target.checked ? "1" : null })} />
            {t("f.in_stock")}
          </label>
        </fieldset>
        {!data.fixed_brand && facets.brands.length > 0 && (
          <fieldset>
            <legend className="mb-2 font-bold">{t("f.brand")}</legend>
            <ul className="max-h-64 space-y-0.5 overflow-y-auto pe-1">
              {facets.brands.map((b: any) => (
                <li key={b.slug}>
                  <label className="flex items-center gap-2.5 py-1">
                    <input type="checkbox" className="check" checked={selectedBrands.includes(b.slug)} onChange={() => toggleBrand(b.slug)} />
                    <span className="flex-1">{b.name}</span><span className="text-xs text-muted tabular-nums">{b.count}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <fieldset>
          <legend className="mb-2 font-bold">{t("f.price")}</legend>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ min: min || null, max: max || null }); }}>
            <label className="flex-1 text-xs text-muted">{t("f.from")}
              <input className="input mt-1 h-10" inputMode="decimal" value={min} placeholder={String(Math.floor(facets.price_min / 100))} onChange={(e) => setMin(e.target.value.replace(/[^\d.]/g, ""))} />
            </label>
            <label className="flex-1 text-xs text-muted">{t("f.to")}
              <input className="input mt-1 h-10" inputMode="decimal" value={max} placeholder={String(Math.ceil(facets.price_max / 100))} onChange={(e) => setMax(e.target.value.replace(/[^\d.]/g, ""))} />
            </label>
            <Button variant="outline" size="sm" className="h-10" type="submit">{t("f.apply")}</Button>
          </form>
        </fieldset>
        <fieldset>
          <legend className="mb-2 font-bold">{t("f.rating")}</legend>
          {[4, 3].map((r) => (
            <label key={r} className="flex items-center gap-2.5 py-1">
              <input type="radio" name="rating" className="check rounded-full" checked={query.get("rating") === String(r)} onChange={() => setParams({ rating: String(r) })} />
              <Stars value={r} /><span className="text-sm">{t("f.and_up")}</span>
            </label>
          ))}
          {query.get("rating") && <button type="button" className="mt-1 text-sm text-accent hover:underline" onClick={() => setParams({ rating: null })}>{t("f.any_rating")}</button>}
        </fieldset>
        {activeCount > 0 && <Button variant="ghost" size="sm" icon="x" onClick={() => setParams({ brand: null, min: null, max: null, in_stock: null, rating: null })}>{t("f.clear")}</Button>}
      </div>
    );
  }

  return (
    <div className="container-x py-5 md:py-7">
      <Breadcrumbs items={crumbs.length ? crumbs : [{ name: data.title }]} />
      <header className="mb-4">
        <h1 className="h-page">{data.title}</h1>
        {data.category?.description && <p className="mt-2 max-w-[75ch] text-muted">{data.category.description}</p>}
      </header>

      {node && node.children.length > 0 && (
        <ul className="scroll-x mb-5">
          {node.children.map((c) => (
            <li key={c.id} className="shrink-0 snap-start">
              <Link to={`/c/${c.slug}`} className="card flex items-center gap-2 px-3 py-2 text-sm font-medium hover:border-fg"><Glyph name={c.icon} size={20} className="text-muted" />{c.name}<span className="text-xs text-muted tabular-nums">{c.product_count}</span></Link>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
        <aside className="hidden lg:block" aria-label={t("f.title")}>
          <div className="card sticky top-4 p-4"><Filters /></div>
        </aside>
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" aria-live="polite">{t("list.count", { n: data.total ?? 0 })}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" icon="filter" className="lg:hidden" onClick={() => setSheet(true)}>
                {t("f.title")}{activeCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-accent text-[11px] text-accent-fg">{activeCount}</span>}
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <span className="hidden text-muted sm:inline">{t("sort.label")}</span>
                <Select className="h-9 w-auto min-w-40 text-sm" value={query.get("sort") ?? ""} onChange={(e) => setParams({ sort: e.target.value || null })} aria-label={t("sort.label")}>
                  <option value="">{t("sort.relevance")}</option>
                  <option value="price_asc">{t("sort.price_asc")}</option>
                  <option value="price_desc">{t("sort.price_desc")}</option>
                  <option value="newest">{t("sort.newest")}</option>
                  <option value="popular">{t("sort.popular")}</option>
                  <option value="rating">{t("sort.rating")}</option>
                </Select>
              </label>
            </div>
          </div>
          {data.items?.length ? (
            <>
              <ProductGrid items={data.items} dense />
              <Pagination page={data.page} pages={data.pages} onPage={(p) => { const q = new URLSearchParams(route.search); if (p > 1) q.set("page", String(p)); else q.delete("page"); const qs = q.toString(); void app.navigate(`${route.path}${qs ? `?${qs}` : ""}`); }} />
            </>
          ) : (
            <Empty icon="search" title={t("list.empty")} text={query.get("q") ? t("list.empty_search", { q: query.get("q") }) : t("list.empty_text")}>
              {activeCount > 0 && <Button variant="outline" onClick={() => setParams({ brand: null, min: null, max: null, in_stock: null, rating: null })}>{t("f.clear")}</Button>}
              <Link to="/products" className="btn btn-primary btn-md">{t("nav.all_products")}</Link>
            </Empty>
          )}
        </div>
      </div>

      <Modal open={sheet} onClose={() => setSheet(false)} title={t("f.title")}>
        <Filters />
        <Button className="mt-6 w-full" onClick={() => setSheet(false)}>{t("list.show", { n: data.total ?? 0 })}</Button>
      </Modal>
    </div>
  );
}

export function CategoriesIndex() {
  const { t, shell } = useApp();
  return (
    <div className="container-x py-5 md:py-7">
      <Breadcrumbs items={[{ name: t("nav.categories") }]} />
      <h1 className="h-page mb-5">{t("nav.categories")}</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shell.categories.map((c) => (
          <li key={c.id} className="card flex gap-4 p-4">
            <Link to={`/c/${c.slug}`} className="grid size-16 shrink-0 place-items-center rounded-md bg-plate text-fg/75" tabIndex={-1} aria-hidden="true"><Glyph name={c.icon} size={36} /></Link>
            <div className="min-w-0">
              <h2 className="font-bold"><Link to={`/c/${c.slug}`} className="hover:text-accent">{c.name}</Link></h2>
              <p className="text-sm text-muted">{t("list.count", { n: c.product_count })}</p>
              {c.children.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  {c.children.map((ch) => <li key={ch.id}><Link to={`/c/${ch.slug}`} className="text-accent hover:underline">{ch.name}</Link></li>)}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BrandsIndex() {
  const { t, data } = useApp();
  return (
    <div className="container-x py-5 md:py-7">
      <Breadcrumbs items={[{ name: t("nav.brands") }]} />
      <h1 className="h-page mb-5">{t("nav.brands")}</h1>
      {data.brands?.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {data.brands.map((b: any) => (
            <li key={b.id}>
              <Link to={`/brand/${b.slug}`} className="card grid h-24 place-items-center p-3 text-center text-lg font-semibold hover:border-fg">
                {b.logo_url ? <img src={b.logo_url} alt={b.name} loading="lazy" className="max-h-12 max-w-full object-contain" /> : b.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : <Empty icon="tag" title={t("list.empty")} />}
    </div>
  );
}

