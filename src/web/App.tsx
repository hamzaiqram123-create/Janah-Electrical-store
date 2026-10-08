import type { ComponentType } from "react";
import type { Dict } from "../shared/i18n/format";
import type { RouteName } from "../shared/routes";
import { AppProvider, useApp, type Payload } from "./lib/ctx";
import { Footer, Header, MobileNav, WhatsAppButton } from "./shell/Chrome";
import { InstallBanner, OfflineBar } from "./parts/InstallApp";
import Home from "./pages/Home";
import Listing, { BrandsIndex, CategoriesIndex } from "./pages/Listing";
import ProductPage from "./pages/Product";
import CartPage from "./pages/Cart";
import Checkout from "./pages/Checkout";
import OrderPage, { TrackPage } from "./pages/Order";
import InvoicePage from "./pages/Invoice";
import { Forgot, Login, Register, Reset } from "./pages/Auth";
import { AccountAddresses, AccountHome, AccountOrders, AccountTicket, AccountTickets, AccountWishlist } from "./pages/Account";
import { Contact, Faq, NotFound, StaticPage } from "./pages/Support";

const PAGES: Record<RouteName, ComponentType> = {
  home: Home,
  listing: Listing, category: Listing, brand: Listing, search: Listing,
  categories: CategoriesIndex, brands: BrandsIndex,
  product: ProductPage,
  cart: CartPage, checkout: Checkout,
  order: OrderPage, track: TrackPage, invoice: InvoicePage,
  login: Login, register: Register, forgot: Forgot, reset: Reset,
  account: AccountHome, account_orders: AccountOrders, account_addresses: AccountAddresses, account_wishlist: AccountWishlist,
  account_tickets: AccountTickets, account_ticket: AccountTicket,
  contact: Contact, faq: Faq, page: StaticPage,
  not_found: NotFound,
};

function Layout() {
  const app = useApp();
  const Page = PAGES[app.route.name] ?? NotFound;
  // The invoice is a standalone printable document without the shop chrome.
  if (app.route.name === "invoice") return <Page />;
  return (
    <>
      {app.pending && <div className="route-bar" aria-hidden="true" />}
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[90] focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:text-fg focus:shadow-lg">{app.t("c.skip")}</a>
      <OfflineBar />
      <Header />
      <main id="main" className="min-h-[55vh]">
        <Page key={app.route.path} />
      </main>
      <Footer />
      <MobileNav />
      <InstallBanner />
      <WhatsAppButton />
    </>
  );
}

export function App({ initial, dict }: { initial: Payload; dict: Dict }) {
  return (
    <AppProvider initial={initial} dict={dict}>
      <Layout />
    </AppProvider>
  );
}
