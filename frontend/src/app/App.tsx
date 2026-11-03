import { useEffect, useMemo, useState } from "react";
import { OrdersView } from "@/features/store/OrdersView";
import { ProductsView } from "@/features/store/ProductsView";
import { ReportsView } from "@/features/store/ReportsView";
import { CollectionsView } from "@/features/store/CollectionsView";
import { InstagramTrackerView } from "@/features/store/InstagramTrackerView";
import { appConfig } from "./config";
import { getStock, tr } from "@/features/store/model";
import { StoreProvider, useStore } from "@/features/store/StoreContext";
import { AuthProvider, SignInPage, StaffManager, useAuth } from "./AuthContext";
import { euro } from "@/features/store/StoreUI";

type Screen = "home" | "products" | "orders" | "reports" | "collections" | "instagram";

function StoreApp({ onSignOut, email, role, localMode = false }: { onSignOut: () => void; email: string; role: "Owner" | "Staff" | null; localMode?: boolean }) {
  const { data, commit, warning, loading } = useStore();
  const [screen, setScreen] = useState<Screen>("home");
  const t = (sq: string, en: string) => tr(data.language, sq, en);
  useEffect(() => {
    document.documentElement.lang = data.language;
    document.title = data.language === "sq" ? "Atelier — Menaxhimi i butikut" : "Atelier — Boutique management";
  }, [data.language]);
  const activeOrders = data.orders.filter((order) => order.status !== "cancelled");
  const completedOrders = data.orders.filter((order) => order.status === "paid" || order.status === "sent" || order.status === "delivered");
  const revenue = completedOrders.reduce((total, order) => total + order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0), 0);
  const itemCount = data.products.reduce((sum, product) => sum + getStock(product), 0);
  const lowStock = data.products.filter((product) => getStock(product) < 5);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthOrders = completedOrders.filter((order) => order.createdAt.slice(0, 7) === thisMonth);
  const monthlySales = monthOrders.reduce((total, order) => total + order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0), 0);
  const dayLabels = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (6 - index));
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const amount = completedOrders.filter((order) => order.createdAt.slice(0, 10) === key)
        .reduce((sum, order) => sum + order.lines.reduce((items, line) => items + line.quantity * line.unitPrice, 0), 0);
      return { label: new Intl.DateTimeFormat(data.language === "sq" ? "sq-AL" : "en-GB", { weekday: "short" }).format(date), amount };
    });
  }, [completedOrders, data.language]);
  const maxDay = Math.max(...dayLabels.map((day) => day.amount), 1);
  const formatter = new Intl.DateTimeFormat(data.language === "sq" ? "sq-AL" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
  if (loading) return <div className="loading-screen">Atelier <span>{t("Duke hapur dyqanin…", "Opening your store…")}</span></div>;

  const nav = [
    { id: "home" as const, label: t("Përmbledhje", "Overview"), icon: "01" },
    { id: "products" as const, label: t("Produktet", "Products"), icon: "02" },
    { id: "orders" as const, label: t("Porositë", "Orders"), icon: "03" },
    { id: "collections" as const, label: t("Koleksionet", "Collections"), icon: "04" },
    { id: "instagram" as const, label: "Instagram", icon: "05" },
    { id: "reports" as const, label: t("Raportet & eksporti", "Reports & exports"), icon: "06" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-symbol">A</div><div><strong>Atelier</strong><small>{t("MENAXHIMI I BUTIKUT", "BOUTIQUE MANAGEMENT")}</small></div></div>
        <div className="sidebar-label">{t("MENUJA", "WORKSPACE")}</div>
        <nav className="sidebar-nav" aria-label={t("Navigimi kryesor", "Main navigation")}>
          {nav.map((item) => <button key={item.id} className={`nav-item ${screen === item.id ? "nav-active" : ""}`} onClick={() => setScreen(item.id)}><span className="nav-number">{item.icon}</span><span>{item.label}</span>{item.id === "orders" && activeOrders.length > 0 && <span className="nav-count">{activeOrders.length}</span>}</button>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-tip"><div className="tip-mark">✳</div><strong>{t("Një hap përpara.", "One step ahead.")}</strong><p>{t("Mbani ngjyrat, madhësitë dhe stokun në sinkron.", "Keep colors, sizes and stock in sync.")}</p><button onClick={() => setScreen("products")}>{t("Shiko koleksionin", "View collection")} ↗</button></div>
        <div className="sidebar-footer"><span className="online-dot" />{localMode ? t("Të dhënat ruhen në shfletues", "Data saved in this browser") : t("Të dhënat ndahen në SQL", "Store data shared online")}</div>
      </aside>
      <main className="main-panel">
        <header className="topbar"><div className="breadcrumb">{t("BUTIKU", "BOUTIQUE")}<span>/</span><strong>{nav.find((item) => item.id === screen)?.label}</strong></div>
          <div className="topbar-right">
            <div className="language-switch" role="group" aria-label={t("Gjuha", "Language")}><button className={data.language === "sq" ? "language-active" : ""} onClick={() => void commit((current) => ({ ...current, language: "sq" }))}>SQ</button><button className={data.language === "en" ? "language-active" : ""} onClick={() => void commit((current) => ({ ...current, language: "en" }))}>EN</button></div>
            <span className="top-date">{formatter.format(new Date())}</span>
            <span className="signed-in-user" title={email}>{email}<small>{role}</small></span>
            {!localMode && role === "Owner" && <StaffManager language={data.language} />}
            {!localMode && <button type="button" className="button button-light button-signout" onClick={onSignOut}>{t("Dil", "Sign out")}</button>}
          </div>
        </header>
        {localMode && <div className="storage-warning local-mode-notice" role="status">{t("Modalitet lokal: hyrja nuk kërkohet dhe të dhënat ruhen vetëm në këtë shfletues. Të dhënat lokale nuk transferohen automatikisht kur lidheni me API-në; shkarkoni një kopje rezervë para lidhjes.", "Local mode: no sign-in is required and data is stored only in this browser. Local data will not transfer automatically when you connect the API; export a backup before connecting.")}</div>}
        {warning && <div className="storage-warning" role="alert">{t("Problemi me sinkronizimin:", "Sync problem:")} {warning} {t("Kontrolloni lidhjen ose rifreskoni para se të provoni përsëri.", "Check the connection or reload before trying again.")}</div>}
        {screen === "home" && <div className="view dashboard">
          <header className="welcome-head"><div><div className="eyebrow">{t("MENAXHIMI I BUTIKUT", "BOUTIQUE MANAGEMENT")}</div><h1>{t("Mirë se erdhe në Atelier.", "Welcome to Atelier.")}</h1><p>{t("Një pamje e qartë e koleksionit dhe shitjeve tuaja.", "A clear view of your collection and sales.")}</p></div><button className="button button-dark" onClick={() => setScreen("orders")}>+ {t("Regjistro shitje", "Record a sale")}</button></header>
          <section className="metric-grid">
            <article className="metric-card metric-primary"><div className="metric-label">{t("SHITJET KËTË MUAJ", "SALES THIS MONTH")}<span>↗</span></div><strong>{euro.format(monthlySales)}</strong><small>{monthOrders.length} {data.language === "sq" ? t("porosi aktive", "active orders") : monthOrders.length === 1 ? "active order" : "active orders"}</small><div className="metric-corner">€</div></article>
            <article className="metric-card"><div className="metric-label">{t("ARTIKUJ NË STOK", "ITEMS IN STOCK")}<span>◫</span></div><strong>{itemCount}</strong><small>{data.products.length} {data.language === "sq" ? t("modele në katalog", "styles in catalogue") : data.products.length === 1 ? "style in catalogue" : "styles in catalogue"}</small><div className="metric-corner metric-corner-muted">▤</div></article>
            <article className="metric-card"><div className="metric-label">{t("POROSI TË HAPURA", "OPEN ORDERS")}<span>↗</span></div><strong>{activeOrders.filter((order) => order.status === "new" || order.status === "paid").length}</strong><small>{t("në pritje të dërgesës / përfundimit", "awaiting dispatch / completion")}</small><div className="metric-corner metric-corner-muted">◷</div></article>
          </section>
          <section className="dashboard-grid">
            <article className="panel sales-panel"><div className="panel-heading"><div><div className="eyebrow">{t("PERFORMANCA", "PERFORMANCE")}</div><h2>{t("Shitjet e fundit", "Recent sales")}</h2></div><button className="text-button" onClick={() => setScreen("reports")}>{t("Raportet", "Reports")} ↗</button></div>
              <div className="chart-total">{euro.format(revenue)} <small>{t("shitje gjithsej", "lifetime sales")}</small></div>
              <div className="bar-chart" aria-label={t("Shitjet ditore gjatë javës së fundit", "Daily sales over the last week")}>{dayLabels.map((day, index) => <div className="bar-column" key={`${day.label}-${index}`}><div className="bar-track"><div className={`bar-fill ${index === 6 ? "bar-current" : ""}`} style={{ height: `${Math.max(4, day.amount / maxDay * 100)}%` }} title={euro.format(day.amount)} /></div><span>{day.label}</span></div>)}</div>
            </article>
            <article className="panel stock-panel"><div className="panel-heading"><div><div className="eyebrow">{t("INVENTARI", "INVENTORY")}</div><h2>{t("Kujdes stoku", "Stock watch")}</h2></div><button className="text-button" onClick={() => setScreen("products")}>{t("Katalogu", "Catalogue")} ↗</button></div>
              {lowStock.length ? <div className="stock-watch-list">{lowStock.slice(0, 4).map((product) => <div className="stock-watch-item" key={product.id}><div className="mini-product-photo">{product.image ? <img src={product.image} alt="" /> : "✳"}</div><div className="stock-watch-name"><strong>{product.name}</strong><small>{product.brand || product.category}</small></div><span className={`stock-quantity ${getStock(product) === 0 ? "qty-out" : ""}`}>{getStock(product)} {t("copë", "left")}</span></div>)}</div> : <div className="stock-all-good"><span>✳</span><strong>{t("Gjithçka duket mirë.", "Looking good.")}</strong><small>{t("Asnjë produkt nën 5 copë.", "No products below 5 units.")}</small></div>}
            </article>
          </section>
          <section className="bottom-strip"><div><span className="strip-icon">✳</span><div><strong>{t("Shitje me pakicë dhe shumicë", "Retail and wholesale sales")}</strong><small>{t("Çmimi i duhur. Stoku përditësohet automatikisht.", "The right price. Stock updates automatically.")}</small></div></div><button className="button button-outline" onClick={() => setScreen("orders")}>{t("Hap porositë", "Open orders")} →</button></section>
        </div>}
        {screen === "products" && <ProductsView />}
        {screen === "orders" && <OrdersView />}
        {screen === "collections" && <CollectionsView />}
        {screen === "instagram" && <InstagramTrackerView />}
        {screen === "reports" && <ReportsView />}
      </main>
      <nav className="mobile-nav" aria-label={t("Navigimi kryesor", "Main navigation")}>{nav.map((item) => <button key={item.id} className={screen === item.id ? "mobile-active" : ""} onClick={() => setScreen(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
    </div>
  );
}

export function App() {
  return appConfig.apiBaseUrl
    ? <AuthProvider><SignedInApp /></AuthProvider>
    : <AuthProvider><StoreProvider><StoreApp onSignOut={() => undefined} email="Local mode" role="Owner" localMode /></StoreProvider></AuthProvider>;
}

function SignedInApp() {
  const { token, email, role, signOut } = useAuth();
  if (!token) return <SignInPage />;
  return <StoreProvider><StoreApp onSignOut={signOut} email={email} role={role} /></StoreProvider>;
}
