import { useMemo, useState, type FormEvent } from "react";
import { createId, isOrderStatus, localDateTime, tr, type Order, type OrderLine, type OrderStatus, type Product } from "./model";
import { useStore } from "./StoreContext";
import { Dialog, EmptyState, euro, PageHeader } from "./StoreUI";

function OrderEditor({ onClose }: { onClose: () => void }) {
  const { data, commit } = useStore();
  const t = (sq: string, en: string) => tr(data.language, sq, en);
  const [channel, setChannel] = useState<"retail" | "wholesale">("retail");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerFiscalNumber, setCustomerFiscalNumber] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(data.products.find((p) => p.variants.some((v) => v.stock > 0))?.id ?? "");
  const selectedProduct = data.products.find((p) => p.id === selectedProductId);
  const [selectedVariantId, setSelectedVariantId] = useState(selectedProduct?.variants.find((v) => v.stock > 0)?.id ?? "");
  const selectedVariant = selectedProduct?.variants.find((v) => v.id === selectedVariantId);
  const [quantity, setQuantity] = useState(1);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [error, setError] = useState("");
  const eligibleProducts = data.products.filter((product) => product.variants.some((variant) => variant.stock > 0));
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  const changeChannel = (next: "retail" | "wholesale") => {
    setChannel(next);
    setLines((current) => current.map((line) => {
      const product = data.products.find((item) => item.id === line.productId);
      return product ? { ...line, unitPrice: next === "wholesale" ? product.wholesalePrice : product.retailPrice } : line;
    }));
  };

  const changeProduct = (id: string) => {
    setSelectedProductId(id);
    setSelectedVariantId(data.products.find((p) => p.id === id)?.variants.find((v) => v.stock > 0)?.id ?? "");
  };

  const addLine = () => {
    if (!selectedProduct || !selectedVariant || !Number.isInteger(quantity) || quantity < 1 || quantity > selectedVariant.stock) {
      setError(t("Kontrolloni produktin dhe sasinë në stok.", "Check the product and available stock."));
      return;
    }
    const price = channel === "wholesale" ? selectedProduct.wholesalePrice : selectedProduct.retailPrice;
    const existingQuantity = lines.filter((line) => line.productId === selectedProduct.id && line.variantId === selectedVariant.id).reduce((sum, line) => sum + line.quantity, 0);
    if (existingQuantity + quantity > selectedVariant.stock) {
      setError(t("Sasia tejkalon stokun e disponueshëm.", "That quantity exceeds available stock."));
      return;
    }
    setLines((current) => [...current, {
      productId: selectedProduct.id,
      variantId: selectedVariant.id,
      productName: selectedProduct.name,
      sku: selectedProduct.sku,
      color: selectedVariant.color,
      size: selectedVariant.size,
      quantity,
      unitPrice: price,
    }]);
    setError("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!lines.length) return setError(t("Shtoni të paktën një produkt në porosi.", "Add at least one product to the order."));
    if (lines.some((line) => {
      const variant = data.products.find((product) => product.id === line.productId)?.variants.find((item) => item.id === line.variantId);
      return !variant || !Number.isInteger(line.quantity) || line.quantity < 1 || variant.stock < line.quantity;
    })) return setError(t("Stoku ndryshoi. Kontrolloni sasinë dhe provoni përsëri.", "Stock changed. Check the quantity and try again."));
    const now = new Date();
    const day = localDateTime(now).slice(0, 10).replaceAll("-", "");
    const sequence = String(data.orders.filter((order) => order.number.startsWith(`DR-${day}`)).length + 1).padStart(3, "0");
    const order: Order = {
      id: createId(),
      number: `DR-${day}-${sequence}`,
      createdAt: localDateTime(now),
      channel,
      status: "new",
      customerName: customerName.trim() || t("Klient në dyqan", "Walk-in customer"),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim(),
      customerFiscalNumber: customerFiscalNumber.trim(),
      customerAddress: customerAddress.trim(),
      notes: notes.trim(),
      lines,
    };
    const products = data.products.map((product) => ({
      ...product,
      variants: product.variants.map((variant) => ({
        ...variant,
        stock: variant.stock - lines.filter((line) => line.productId === product.id && line.variantId === variant.id).reduce((sum, line) => sum + line.quantity, 0),
      })),
    }));
    const saved = await commit({ ...data, products, orders: [order, ...data.orders] });
    if (!saved) return setError(t("Porosia nuk u ruajt. Kontrolloni hapësirën e ruajtjes në pajisje.", "Order was not saved. Check available device storage."));
    onClose();
  };

  return (
    <Dialog title={t("Porosi e re", "New order")} onClose={onClose} wide>
      <form className="store-form" onSubmit={submit}>
        <div className="channel-tabs" role="group" aria-label={t("Lloji i shitjes", "Sale type")}>
          <button type="button" className={channel === "retail" ? "channel-tab selected" : "channel-tab"} onClick={() => changeChannel("retail")}><span>01</span>{t("Me pakicë", "Retail")} <small>{t("Klient individual", "Individual customer")}</small></button>
          <button type="button" className={channel === "wholesale" ? "channel-tab selected" : "channel-tab"} onClick={() => changeChannel("wholesale")}><span>02</span>{t("Me shumicë", "Wholesale")} <small>{t("Klient biznes", "Business customer")}</small></button>
        </div>
        <div className="form-grid">
          <label className="control"><span>{t("Emri i klientit", "Customer name")}</span><input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={t("Emri i plotë ose biznesi", "Full name or business")} /></label>
          <label className="control"><span>{t("Telefoni", "Phone")}</span><input className="input" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></label>
          <label className="control"><span>{t("Email", "Email")}</span><input className="input" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} /></label>
          <label className="control"><span>{t("Numri fiskal i klientit", "Customer fiscal number")}</span><input className="input" value={customerFiscalNumber} onChange={(e) => setCustomerFiscalNumber(e.target.value)} /></label>
          <label className="control form-span"><span>{t("Adresa e dërgesës / biznesit", "Delivery / business address")}</span><input className="input" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} /></label>
        </div>
        <div className="order-items">
          <div className="section-title"><div><strong>{t("Produktet e porosisë", "Order items")}</strong><small>{t("Stoku zbritet kur ruani porosinë", "Stock is deducted when you save the order")}</small></div></div>
          {eligibleProducts.length ? (
            <div className="add-line">
              <label className="control"><span>{t("Produkt", "Product")}</span><select className="input" value={selectedProductId} onChange={(e) => changeProduct(e.target.value)}>{eligibleProducts.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku || p.brand || t("Pa SKU", "No SKU")}</option>)}</select></label>
              <label className="control"><span>{t("Ngjyra / madhësia", "Color / size")}</span><select className="input" value={selectedVariantId} onChange={(e) => setSelectedVariantId(e.target.value)}>{selectedProduct?.variants.filter((v) => v.stock > 0).map((v) => <option key={v.id} value={v.id}>{v.color} · {v.size} · {v.stock} {t("në stok", "in stock")}</option>)}</select></label>
              <label className="control"><span>{t("Sasia", "Qty")}</span><input className="input" type="number" min="1" max={selectedVariant?.stock ?? 1} step="1" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} /></label>
              <button type="button" className="button button-light add-line-button" onClick={addLine}>+ {t("Shto", "Add")}</button>
            </div>
          ) : <p className="muted">{t("Shtoni produkte me stok përpara se të krijoni porosi.", "Add products with stock before creating an order.")}</p>}
          {lines.length > 0 && <div className="line-list">{lines.map((line, index) => <div className="line-item" key={`${line.productId}-${line.variantId}-${index}`}><div><strong>{line.productName}</strong><small>{line.color} · {line.size} · {line.quantity} × {euro.format(line.unitPrice)}</small></div><strong>{euro.format(line.quantity * line.unitPrice)}</strong><button type="button" className="icon-button" aria-label={t("Hiq produktin", "Remove item")} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>×</button></div>)}</div>}
          {lines.length > 0 && <div className="order-total"><span>{t("Totali i porosisë", "Order total")}</span><strong>{euro.format(total)}</strong></div>}
        </div>
        <label className="control"><span>{t("Shënime / referenca e porosisë online", "Notes / online order reference")}</span><textarea rows={2} className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("P.sh. Instagram, dërgesë me postë…", "e.g. Instagram, courier delivery…")} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" className="button button-light" onClick={onClose}>{t("Anulo", "Cancel")}</button><button type="submit" className="button button-dark">{t("Ruaj porosinë", "Save order")}</button></div>
      </form>
    </Dialog>
  );
}

const statusNames: Record<OrderStatus, [string, string]> = {
  new: ["E re", "New"],
  paid: ["E paguar", "Paid"],
  sent: ["Dërguar", "Sent"],
  delivered: ["Dorëzuar", "Delivered"],
  cancelled: ["Anuluar", "Cancelled"],
};

function changeOrderStatus(order: Order, status: OrderStatus, products: Product[]): Product[] {
  if (status !== "cancelled" || order.status === "cancelled") return products;
  return products.map((product) => {
    const returned = order.lines.filter((line) => line.productId === product.id);
    if (!returned.length) return product;
    const variants = [...product.variants];
    for (const line of returned) {
      const index = variants.findIndex((variant) => variant.id === line.variantId);
      if (index >= 0) variants[index] = { ...variants[index], stock: variants[index].stock + line.quantity };
      else variants.push({ id: line.variantId, color: line.color, size: line.size, stock: line.quantity });
    }
    return { ...product, variants };
  });
}

export function OrdersView() {
  const { data, commit } = useStore();
  const t = (sq: string, en: string) => tr(data.language, sq, en);
  const dateTime = new Intl.DateTimeFormat(data.language === "sq" ? "sq-AL" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const filtered = useMemo(() => data.orders.filter((order) =>
    `${order.number} ${order.customerName} ${order.customerPhone} ${order.customerEmail}`.toLowerCase().includes(query.toLowerCase()),
  ), [data.orders, query]);
  const updateStatus = (orderId: string, status: OrderStatus) => {
    const order = data.orders.find((item) => item.id === orderId);
    if (!order) return;
    const products = changeOrderStatus(order, status, data.products);
    void commit({ ...data, products, orders: data.orders.map((item) => item.id === orderId ? { ...item, status } : item) });
  };
  const deleteCancelledOrder = (orderId: string) => {
    if (window.confirm(t("Të fshihet përgjithmonë kjo porosi e anuluar?", "Permanently delete this cancelled order?"))) {
      void commit({ ...data, orders: data.orders.filter((order) => order.id !== orderId) });
    }
  };

  return (
    <div className="view">
      <PageHeader eyebrow={t("SHITJE & KLIENTË", "SALES & CLIENTS")} title={t("Porositë", "Orders")} description={t("Shitjet me pakicë, porositë online dhe klientët me shumicë.", "Retail sales, online orders and wholesale customers.")}
        action={<button className="button button-dark" onClick={() => setShowForm(true)}>+ {t("Porosi e re", "New order")}</button>} />
      <div className="toolbar">
        <label className="search-box"><span aria-hidden>⌕</span><input aria-label={t("Kërko porosi", "Search orders")} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Kërko sipas porosisë, klientit, telefonit", "Search order, customer or phone")} /></label>
        <span className="result-count">{filtered.length} {t("porosi", "orders")}</span>
      </div>
      {filtered.length ? <div className="order-list">
        {filtered.map((order) => {
          const sum = order.lines.reduce((total, line) => total + line.quantity * line.unitPrice, 0);
          return <article className="order-card" key={order.id}>
            <div className="order-card-top">
              <div><span className="order-number">{order.number}</span><time>{dateTime.format(new Date(order.createdAt))}</time></div>
              <span className={`status-badge status-${order.status}`}>{statusNames[order.status][data.language === "sq" ? 0 : 1]}</span>
            </div>
            <div className="order-card-body">
              <div className="customer-block"><strong>{order.customerName}</strong>{order.customerPhone && <span>{order.customerPhone}</span>}{order.customerEmail && <span>{order.customerEmail}</span>}{order.customerAddress && <span>{order.customerAddress}</span>}</div>
              <div className="order-product-lines">{order.lines.map((line, index) => <div className="order-product-line" key={`${line.productId}-${index}`}><span>{line.quantity}×</span><div><strong>{line.productName}</strong><small>{line.color} / {line.size}</small></div><span className="line-price">{euro.format(line.quantity * line.unitPrice)}</span></div>)}</div>
            </div>
            <div className="order-card-bottom"><span className={`channel-tag ${order.channel}`}>{order.channel === "retail" ? t("ME PAKICË", "RETAIL") : t("ME SHUMICË", "WHOLESALE")}</span>{order.notes && <span className="order-note">{order.notes}</span>}{order.status === "cancelled" && <button className="text-button delete-order" onClick={() => deleteCancelledOrder(order.id)}>{t("Fshi", "Delete")}</button>}<strong className="order-sum">{euro.format(sum)}</strong>
              <label className="status-select"><span className="sr-only">{t("Ndrysho statusin", "Change status")}</span><select className="input" value={order.status} disabled={order.status === "cancelled"} onChange={(e) => { if (isOrderStatus(e.target.value)) updateStatus(order.id, e.target.value); }}>{(Object.keys(statusNames) as OrderStatus[]).map((status) => <option key={status} value={status}>{statusNames[status][data.language === "sq" ? 0 : 1]}</option>)}</select></label>
            </div>
          </article>;
        })}
      </div> : <EmptyState title={query ? t("Nuk ka porosi të tilla", "No matching orders") : t("Porosia e parë është një klik larg", "Your first order is one click away")}>{query ? t("Provoni të kërkoni me emër ose numër tjetër.", "Try searching for a different name or order number.") : t("Regjistroni shitjet, mbani të dhënat e klientit dhe zbritni automatikisht artikujt nga stoku.", "Record sales, save customer details and automatically deduct items from stock.")}</EmptyState>}
      {showForm && <OrderEditor onClose={() => setShowForm(false)} />}
    </div>
  );
}
