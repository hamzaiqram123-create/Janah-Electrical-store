import { useApp } from "../lib/ctx";
import { ProductGrid, RecentlyViewed, SectionHead, type Card } from "../parts/Product";
import { Glyph, Icon } from "../ui/Icon";
import { Link, Stars } from "../ui/kit";

const WIRES = ["#7a4a2b", "#1b1f23", "#8b9299"];
const UNITS: { w: number; label: string; off?: boolean; rccb?: boolean }[] = [
  { w: 2, label: "40A 30mA", rccb: true }, { w: 1, label: "C32" }, { w: 1, label: "C20" }, { w: 1, label: "C20" },
  { w: 1, label: "C16" }, { w: 1, label: "C16" }, { w: 1, label: "C10" }, { w: 1, label: "C10", off: true },
];

/** A consumer unit on its DIN rail: the object every order on this site ends up in. Handles switch on once when the page loads. */
function PanelArt() {
  const u = 52;
  let x = 46;
  const placed = UNITS.map((b, i) => { const at = { ...b, x, i, width: u * b.w - 6 }; x += u * b.w; return at; });
  return (
    <svg viewBox="0 0 560 340" className="h-auto w-full max-w-[540px]" width="540" height="328" role="img" aria-hidden="true">
      <rect x="6" y="6" width="548" height="328" rx="10" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="2" />
      <rect x="28" y="38" width="504" height="176" rx="4" fill="var(--plate)" />
      <rect x="28" y="112" width="504" height="26" fill="#b9c0c2" opacity="0.55" />
      {placed.slice(1).map((b, k) => {
        const cx = b.x + b.width / 2, tx = 150 + k * 22;
        return <path key={`w${b.i}`} d={`M${cx} 190 V228 C${cx} 262 ${tx} 262 ${tx} 296 V334`} fill="none" stroke={WIRES[k % 3]} strokeWidth="5" strokeLinecap="round" />;
      })}
      <path d="M118 190 V250 C118 280 330 268 330 300 V334" fill="none" stroke="#1f5fbf" strokeWidth="5" strokeLinecap="round" />
      <path d="M72 190 V262 C72 300 380 280 380 310 V334" fill="none" stroke="#2f8f4e" strokeWidth="5" strokeLinecap="round" />
      <path d="M72 190 V262 C72 300 380 280 380 310 V334" fill="none" stroke="#f2c200" strokeWidth="5" strokeDasharray="9 9" />
      {placed.map((b) => {
        const cx = b.x + b.width / 2;
        return (
          <g key={b.i}>
            <rect x={b.x} y="60" width={b.width} height="130" rx="3" fill="#f6f7f6" stroke="#aeb6b9" />
            <rect x={b.x} y="60" width={b.width} height="14" rx="3" fill="#dfe3e1" />
            <rect x={b.x} y="176" width={b.width} height="14" rx="3" fill="#dfe3e1" />
            {Array.from({ length: b.w }).map((_, k) => <circle key={k} cx={b.x + 23 + k * u} cy="67" r="3.500" fill="#8b9299" />)}
            {Array.from({ length: b.w }).map((_, k) => <circle key={k} cx={b.x + 23 + k * u} cy="183" r="3.500" fill="#8b9299" />)}
            <rect x={cx - 12} y="96" width="24" height="46" rx="2" fill="#e3e7e5" stroke="#aeb6b9" />
            <rect x={cx - 9} y={b.off ? 120 : 99} width="18" height="19" rx="2" fill="#17202a"
              style={b.off ? undefined : { animation: `breaker-on 0.32s cubic-bezier(.3,1.4,.6,1) ${0.25 + b.i * 0.09}s both` }} />
            <rect x={cx - 5} y="147" width="10" height="4" rx="1" fill={b.off ? "#2f8f4e" : "#c0392b"} />
            {b.rccb && <><rect x={b.x + 8} y="100" width="16" height="12" rx="2" fill="#f2c200" /><text x={b.x + 16} y="110" fontSize="9" fontWeight="700" textAnchor="middle" fill="#17202a">T</text></>}
            <text x={cx} y="168" fontSize={b.rccb ? 10 : 11} fontWeight="700" textAnchor="middle" fill="#17202a" fontFamily="'IBM Plex Sans', sans-serif">{b.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function ProductSection({ title, items, to }: { title: string; items: Card[]; to: string }) {
  const { t } = useApp();
  if (!items.length) return null;
  return (
    <section className="container-x mt-12">
      <SectionHead title={title} to={to} more={t("c.view_all")} />
      <ProductGrid items={items} />
    </section>
  );
}

export default function Home() {
  const app = useApp();
  const { t, shell, data } = app;
  const banners = (data.banners ?? []) as any[];
  const hero = banners.find((b) => b.placement === "hero");
  const promos = banners.filter((b) => b.placement === "promo");
  const lists = data.lists ?? {};
  const store = shell.settings.store;
  const sectionTitle = (s: any, key: string) => s.title || t(key);

  const render = (s: any) => {
    switch (s.type) {
      case "hero":
        return (
          <section key={s.id} className="border-b border-line bg-surface">
            <div className="container-x grid items-center gap-8 py-8 md:grid-cols-[1.05fr_1fr] md:py-12">
              <div>
                <h1 className="text-[1.75rem] leading-[1.25] font-bold text-balance md:text-[2.6rem]">{hero?.title || store.tagline}</h1>
                {hero?.subtitle && <p className="mt-4 max-w-[58ch] text-base text-muted md:text-lg">{hero.subtitle}</p>}
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link to={hero?.link || "/products"} className="btn btn-primary btn-lg">{hero?.cta || t("nav.all_products")}</Link>
                  <Link to="/categories" className="btn btn-outline btn-lg">{t("nav.categories")}</Link>
                </div>
                <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
                  {["hero.fact_vat", "hero.fact_invoice", "hero.fact_delivery"].map((k) => (
                    <li key={k} className="flex items-center gap-1.5"><Icon name="check" size={16} className="text-ok" />{t(k)}</li>
                  ))}
                </ul>
              </div>
              <div className="hidden w-full justify-end md:flex">
                {hero?.image_url ? <img src={hero.image_url} alt="" className="max-h-[360px] w-full rounded-md object-cover" /> : <PanelArt />}
              </div>
            </div>
          </section>
        );
      case "categories":
        return (
          <section key={s.id} className="container-x mt-10">
            <SectionHead title={sectionTitle(s, "home.categories")} to="/categories" more={t("c.view_all")} />
            <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:gap-3 lg:grid-cols-6">
              {shell.categories.slice(0, s.limit).map((c) => (
                <li key={c.id}>
                  <Link to={`/c/${c.slug}`} className="card flex h-full flex-col items-center gap-2 px-2 py-4 text-center hover:border-fg">
                    <span className="grid size-14 place-items-center rounded-md bg-plate text-fg/75"><Glyph name={c.icon} size={32} /></span>
                    <span className="text-[13px] leading-tight font-medium md:text-sm">{c.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      case "featured": return <ProductSection key={s.id} title={sectionTitle(s, "home.featured")} items={(lists.featured ?? []).slice(0, s.limit)} to="/products?flag=featured" />;
      case "best_sellers": return <ProductSection key={s.id} title={sectionTitle(s, "home.best")} items={(lists.best_sellers ?? []).slice(0, s.limit)} to="/products?flag=best" />;
      case "new_arrivals": return <ProductSection key={s.id} title={sectionTitle(s, "home.new")} items={(lists.new_arrivals ?? []).slice(0, s.limit)} to="/products?sort=newest" />;
      case "deals": return <ProductSection key={s.id} title={sectionTitle(s, "home.deals")} items={(lists.deals ?? []).slice(0, s.limit)} to="/products?flag=deals" />;
      case "promo":
        if (!promos.length) return null;
        return (
          <section key={s.id} className="container-x mt-12 grid gap-4 md:grid-cols-2">
            {promos.slice(0, s.limit).map((b, i) => (
              <Link key={b.id} to={b.link || "/products"} className="group relative flex min-h-44 overflow-hidden rounded-md bg-header p-6 text-header-fg">
                {b.image_url && <img src={b.image_url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-40" />}
                <span className="relative max-w-[75%]">
                  <span className="block text-xl font-bold md:text-2xl">{b.title}</span>
                  {b.subtitle && <span className="mt-2 block text-sm opacity-80">{b.subtitle}</span>}
                  {b.cta && <span className="mt-4 inline-flex items-center gap-1.5 font-semibold text-[#e39a5b] group-hover:underline">{b.cta}<Icon name="arrow" size={16} /></span>}
                </span>
                {!b.image_url && <Glyph name={i % 2 ? "bulb" : "breaker"} size={150} strokeWidth={0.7} className="absolute -end-4 -bottom-6 opacity-20" />}
              </Link>
            ))}
          </section>
        );
      case "brands":
        if (!data.brands?.length) return null;
        return (
          <section key={s.id} className="container-x mt-12">
            <SectionHead title={sectionTitle(s, "home.brands")} to="/brands" more={t("c.view_all")} />
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
              {data.brands.slice(0, s.limit).map((b: any) => (
                <li key={b.id}>
                  <Link to={`/brand/${b.slug}`} className="card grid h-16 place-items-center px-3 text-center font-semibold hover:border-fg">
                    {b.logo_url ? <img src={b.logo_url} alt={b.name} loading="lazy" className="max-h-9 max-w-full object-contain" /> : b.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      case "reviews":
        if (!data.reviews?.length) return null;
        return (
          <section key={s.id} className="container-x mt-12">
            <SectionHead title={sectionTitle(s, "home.reviews")} />
            <ul className="grid gap-4 md:grid-cols-3">
              {data.reviews.slice(0, s.limit).map((r: any, i: number) => (
                <li key={i} className="card flex flex-col gap-2 p-4">
                  <Stars value={r.rating} />
                  {r.title && <p className="font-semibold">{r.title}</p>}
                  <p className="line-clamp-4 text-sm text-muted">{r.body}</p>
                  <p className="mt-auto pt-2 text-sm font-semibold">{r.author}</p>
                  <Link to={`/p/${r.product.slug}`} className="line-clamp-1 text-sm text-accent hover:underline">{r.product.name}</Link>
                </li>
              ))}
            </ul>
          </section>
        );
      case "why_us":
        return (
          <section key={s.id} className="container-x mt-12">
            <SectionHead title={sectionTitle(s, "home.why")} />
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["tag", "why.price"], ["shield", "why.warranty"], ["receipt", "why.invoice"], ["chat", "why.support"]].map(([icon, key]) => (
                <li key={key} className="card flex gap-3 p-4">
                  <Icon name={icon!} size={26} className="mt-0.5 text-accent" />
                  <div><h3 className="font-bold">{t(`${key}.t`)}</h3><p className="mt-1 text-sm text-muted">{t(`${key}.d`)}</p></div>
                </li>
              ))}
            </ul>
          </section>
        );
      case "delivery":
        return (
          <section key={s.id} className="container-x mt-12">
            <SectionHead title={sectionTitle(s, "home.delivery")} />
            <div className="card grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0 rtl:md:divide-x-reverse">
              {[["truck", "dlv.ship", "/page/shipping"], ["card", "dlv.pay", "/faq"], ["undo", "dlv.return", "/page/returns"]].map(([icon, key, to]) => (
                <div key={key} className="flex gap-3 p-5">
                  <Icon name={icon!} size={26} className="mt-0.5 shrink-0 text-accent" />
                  <div>
                    <h3 className="font-bold">{t(`${key}.t`)}</h3>
                    <p className="mt-1 text-sm text-muted">{t(`${key}.d`)}</p>
                    <Link to={to!} className="mt-2 inline-block text-sm font-semibold text-accent hover:underline">{t("c.details")}</Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      case "contact":
        return (
          <section key={s.id} className="container-x mt-12">
            <div className="card flex flex-col items-start justify-between gap-5 p-6 md:flex-row md:items-center">
              <div>
                <h2 className="text-xl font-bold">{sectionTitle(s, "home.contact")}</h2>
                <p className="mt-1 max-w-[60ch] text-muted">{t("home.contact_text")}</p>
                {store.working_hours && <p className="mt-2 flex items-center gap-2 text-sm text-muted"><Icon name="clock" size={16} />{store.working_hours}</p>}
              </div>
              <div className="flex flex-wrap gap-3">
                {store.phone && <a href={`tel:${store.phone}`} className="btn btn-outline btn-md"><Icon name="phone" size={18} /><span dir="ltr">{store.phone}</span></a>}
                {store.whatsapp && <a href={`https://wa.me/${store.whatsapp.replace(/[^\d]/g, "")}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-md"><Icon name="whatsapp" size={18} />{t("c.whatsapp")}</a>}
                <Link to="/contact" className="btn btn-dark btn-md">{t("nav.contact")}</Link>
              </div>
            </div>
          </section>
        );
      default: return null;
    }
  };

  return (
    <>
      {(data.sections ?? []).map(render)}
      <RecentlyViewed />
    </>
  );
}
