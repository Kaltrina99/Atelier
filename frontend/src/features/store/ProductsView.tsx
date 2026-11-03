import { useMemo, useState, type FormEvent } from "react";
import { createId, getStock, tr, type Product, type ProductVariant } from "./model";
import { useStore } from "./StoreContext";
import { Dialog, EmptyState, euro, PageHeader } from "./StoreUI";

const blankVariant = (language: "sq" | "en"): ProductVariant => ({
  id: createId(),
  color: "",
  size: tr(language, "Një madhësi", "One size"),
  stock: 0,
});

const colorSwatches: Record<string, string> = {
  black: "#282824", "e zezë": "#282824",
  white: "#fffefa", "e bardhë": "#fffefa",
  red: "#af5549", "e kuqe": "#af5549",
  blue: "#617c9b", blu: "#617c9b", "e kaltër": "#617c9b",
  green: "#718469", "e gjelbër": "#718469",
  pink: "#d8a0a4", rozë: "#d8a0a4",
  beige: "#d7c8aa", bezhë: "#d7c8aa",
  brown: "#816553", kafe: "#816553",
  navy: "#364762", vjollcë: "#8a7598",
  gray: "#a5a69e", gri: "#a5a69e",
};

function ProductEditor({ product, onClose }: { product?: Product; onClose: () => void }) {
  const { data, commit } = useStore();
  const t = (sq: string, en: string) => tr(data.language, sq, en);
  const [draft, setDraft] = useState<Product>(() => product ? structuredClone(product) : {
    id: createId(),
    name: "",
    brand: "",
    sku: "",
    category: t("Fustane", "Dresses"),
    description: "",
    costPrice: 0,
    retailPrice: 0,
    wholesalePrice: 0,
    image: null,
    variants: [blankVariant(data.language)],
    createdAt: new Date().toISOString(),
  });
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setField = (field: keyof Product, value: string | number) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const updateVariant = (id: string, field: keyof ProductVariant, value: string | number) =>
    setDraft((current) => ({
      ...current,
      variants: current.variants.map((variant) => variant.id === id ? { ...variant, [field]: value } : variant),
    }));

  const setImage = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("Zgjidhni një skedar imazhi.", "Choose an image file."));
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error(t("Nuk mund të përgatitet imazhi.", "Could not prepare the image."));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      setDraft((current) => ({ ...current, image: canvas.toDataURL("image/jpeg", 0.82) }));
      setError("");
      bitmap.close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Imazhi nuk mund të hapej.", "The image could not be loaded."));
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return setError(t("Shënoni emrin e produktit.", "Enter a product name."));
    if (draft.variants.length === 0 || draft.variants.some((v) => !v.color.trim() || !v.size.trim() || !Number.isInteger(v.stock) || v.stock < 0)) {
      return setError(t("Shtoni ngjyrën dhe madhësinë për secilin variant dhe përdorni sasi të plota.", "Add a color and size for each variant, and use whole-number stock counts."));
    }
    if (new Set(draft.variants.map((v) => `${v.color.trim().toLowerCase()}|${v.size.trim().toLowerCase()}`)).size !== draft.variants.length) {
      return setError(t("Hiqni variantet e përsëritura të ngjyrës dhe madhësisë.", "Remove duplicate color and size variants."));
    }
    if ([draft.costPrice, draft.retailPrice, draft.wholesalePrice].some((price) => !Number.isFinite(price) || price < 0)) {
      return setError(t("Çmimet duhet të jenë numra pozitivë.", "Prices must be valid non-negative numbers."));
    }
    const duplicateSku = data.products.some((p) => p.id !== draft.id && p.sku.trim().toLowerCase() === draft.sku.trim().toLowerCase());
    if (draft.sku.trim() && duplicateSku) return setError(t("Ky SKU është në përdorim.", "That SKU is already in use."));
    const nextProduct = { ...draft, name: draft.name.trim(), brand: draft.brand.trim(), sku: draft.sku.trim() };
    const saved = await commit({
      ...data,
      products: product
        ? data.products.map((item) => item.id === product.id ? nextProduct : item)
        : [nextProduct, ...data.products],
    });
    if (!saved) return setError(t("Nuk u ruajt produkti. Kontrolloni hapësirën e ruajtjes në pajisje.", "Product was not saved. Check available device storage."));
    onClose();
  };

  const deleteProduct = async () => {
    if (!product) return;
    const saved = await commit({ ...data, products: data.products.filter((item) => item.id !== product.id) });
    if (!saved) return setError(t("Produkti nuk u fshi. Kontrolloni ruajtjen në pajisje.", "Product was not deleted. Check device storage."));
    onClose();
  };

  return (
    <Dialog title={product ? t("Ndrysho produktin", "Edit product") : t("Shto produkt", "Add a product")} onClose={onClose} wide>
      <form className="store-form" onSubmit={submit}>
        <div className="form-grid">
          <label className="control"><span>{t("Emri i produktit *", "Product name *")}</span><input autoFocus className="input" value={draft.name} onChange={(e) => setField("name", e.target.value)} placeholder={t("Fustan lino", "Linen wrap dress")} /></label>
              <label className="control"><span>{t("Brendi", "Brand")}</span><input className="input" value={draft.brand} onChange={(e) => setField("brand", e.target.value)} placeholder={t("Emri i brendit", "Brand name")} /></label>
              <label className="control"><span>{t("SKU / Referenca", "SKU / reference")}</span><input className="input" value={draft.sku} onChange={(e) => setField("sku", e.target.value)} placeholder="DR-024" /></label>
              <label className="control"><span>{t("Kategoria", "Category")}</span><input className="input" value={draft.category} onChange={(e) => setField("category", e.target.value)} placeholder={t("Fustane", "Dresses")} /></label>
              <label className="control"><span>{t("Çmimi i blerjes (€)", "Cost price (€)")}</span><input className="input" type="number" min="0" step="0.01" value={draft.costPrice} onChange={(e) => setField("costPrice", Number(e.target.value))} /></label>
              <label className="control"><span>{t("Çmimi me pakicë (€)", "Retail price (€)")}</span><input className="input" type="number" min="0" step="0.01" value={draft.retailPrice} onChange={(e) => setField("retailPrice", Number(e.target.value))} /></label>
              <label className="control"><span>{t("Çmimi me shumicë (€)", "Wholesale price (€)")}</span><input className="input" type="number" min="0" step="0.01" value={draft.wholesalePrice} onChange={(e) => setField("wholesalePrice", Number(e.target.value))} /></label>
              <label className="control"><span>{t("Foto e produktit", "Product photo")}</span><input className="input file-input" type="file" accept="image/*" onChange={(e) => void setImage(e.target.files?.[0])} /></label>
        </div>
        <label className="control"><span>{t("Përshkrimi", "Description")}</span><textarea className="input" rows={2} value={draft.description} onChange={(e) => setField("description", e.target.value)} placeholder={t("Materiali, prerja, kujdesi...", "Fabric, fit, care...")} /></label>
        <div className="variant-section">
          <div className="variant-heading"><div><strong>{t("Ngjyrat, madhësitë dhe stoku", "Colors, sizes & stock")}</strong><small>{t("Ndiqni secilin variant veçmas", "Track each variation separately")}</small></div>
            <button type="button" className="button button-light button-small" onClick={() => setDraft((current) => ({ ...current, variants: [...current.variants, blankVariant(data.language)] }))}>+ {t("Shto variant", "Add variant")}</button>
          </div>
          {draft.variants.map((variant, index) => (
            <div className="variant-row" key={variant.id}>
              <span className="variant-index">{String(index + 1).padStart(2, "0")}</span>
              <label className="control"><span>{t("Ngjyra", "Color")}</span><input className="input" value={variant.color} onChange={(e) => updateVariant(variant.id, "color", e.target.value)} placeholder={t("E zezë", "Black")} /></label>
              <label className="control"><span>{t("Madhësia", "Size")}</span><input className="input" value={variant.size} onChange={(e) => updateVariant(variant.id, "size", e.target.value)} placeholder="S / M / L" /></label>
              <label className="control"><span>{t("Sasia në stok", "In stock")}</span><input className="input" type="number" min="0" step="1" value={variant.stock} onChange={(e) => updateVariant(variant.id, "stock", Number(e.target.value))} /></label>
              <button type="button" className="icon-button remove-variant" aria-label={`Remove variant ${index + 1}`} disabled={draft.variants.length === 1} onClick={() => setDraft((current) => ({ ...current, variants: current.variants.filter((v) => v.id !== variant.id) }))}>×</button>
            </div>
          ))}
        </div>
        {draft.image && <div className="photo-preview"><img src={draft.image} alt={t("Pamja paraprake e produktit", "Product preview")} /><button type="button" className="button button-light button-small" onClick={() => setDraft((current) => ({ ...current, image: null }))}>{t("Hiq foton", "Remove photo")}</button></div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {confirmDelete && <div className="delete-confirm"><span>{t("Porositë e kaluara do t'i ruajnë të dhënat e këtij produkti.", "Past orders will keep their saved product details.")}</span><button type="button" className="button button-danger button-small" onClick={() => void deleteProduct()}>{t("Fshije produktin", "Delete product")}</button></div>}
        <div className="dialog-actions">{product && !confirmDelete && <button type="button" className="button button-danger" onClick={() => setConfirmDelete(true)}>{t("Fshi produktin", "Delete product")}</button>}<button type="button" className="button button-light" onClick={onClose}>{t("Anulo", "Cancel")}</button><button type="submit" className="button button-dark">{product ? t("Ruaj ndryshimet", "Save changes") : t("Ruaj produktin", "Save product")}</button></div>
      </form>
    </Dialog>
  );
}

export function ProductsView() {
  const { data } = useStore();
  const t = (sq: string, en: string) => tr(data.language, sq, en);
  const [search, setSearch] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minStock, setMinStock] = useState("");
  const [maxStock, setMaxStock] = useState("");
  const [retailAvailable, setRetailAvailable] = useState(false);
  const [wholesaleAvailable, setWholesaleAvailable] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null | undefined>();
  const activeFilters = Number(Boolean(minPrice || maxPrice)) + Number(Boolean(minStock || maxStock))
    + Number(retailAvailable) + Number(wholesaleAvailable);
  const products = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const minCost = minPrice === "" ? null : Number(minPrice);
    const maxCost = maxPrice === "" ? null : Number(maxPrice);
    const minUnits = minStock === "" ? null : Number(minStock);
    const maxUnits = maxStock === "" ? null : Number(maxStock);
    return data.products.filter((product) => {
      const stock = getStock(product);
      const haystack = `${product.name} ${product.brand} ${product.sku} ${product.category} ${product.variants.map((variant) => variant.color).join(" ")}`.toLocaleLowerCase();
      const price = product.retailPrice;
      return (!term || haystack.includes(term))
        && (minCost === null || price >= minCost)
        && (maxCost === null || price <= maxCost)
        && (minUnits === null || stock >= minUnits)
        && (maxUnits === null || stock <= maxUnits)
        && (!retailAvailable || price > 0)
        && (!wholesaleAvailable || product.wholesalePrice > 0);
    });
  }, [data.products, search, minPrice, maxPrice, minStock, maxStock, retailAvailable, wholesaleAvailable]);

  const clearFilters = () => {
    setSearch("");
    setMinPrice("");
    setMaxPrice("");
    setMinStock("");
    setMaxStock("");
    setRetailAvailable(false);
    setWholesaleAvailable(false);
  };

  return (
    <div className="view">
      <PageHeader eyebrow={t("KATALOGU", "CATALOGUE")} title={t("Koleksioni juaj", "Your collection")} description={t("Çdo model, madhësi dhe ngjyrë — në një vend.", "Every style, size and color — all in one place.")}
        action={<button className="button button-dark" onClick={() => setEditing(null)}>+ {t("Shto produkt", "Add product")}</button>} />
      <div className="toolbar">
        <label className="search-box"><span aria-hidden>⌕</span><input aria-label={t("Kërko produkte sipas emrit, brendit ose ngjyrës", "Search products by name, brand or color")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Kërko emër, brend ose ngjyrë", "Search name, brand or color")} />{search && <button className="search-clear" type="button" aria-label={t("Pastro kërkimin", "Clear search")} onClick={() => setSearch("")}>×</button>}</label>
        <div className="toolbar-end"><span className="result-count">{products.length} / {data.products.length} {t("produkte", "products")}</span><button className={`button button-light filter-toggle ${filtersOpen || activeFilters ? "filter-active" : ""}`} onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}><span>☷</span>{t("Filtrat", "Filters")}{activeFilters > 0 && <b>{activeFilters}</b>}</button></div>
      </div>
      {filtersOpen && <section className="filter-panel" aria-label={t("Filtrat e produkteve", "Product filters")}>
        <div className="filter-group"><strong>{t("Çmimi me pakicë (€)", "Retail price (€)")}</strong><div className="filter-range"><label className="sr-only" htmlFor="min-price">{t("Çmimi minimal", "Minimum price")}</label><input id="min-price" className="input" type="number" min="0" step="0.01" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder={t("Nga", "Min")} /><span>—</span><label className="sr-only" htmlFor="max-price">{t("Çmimi maksimal", "Maximum price")}</label><input id="max-price" className="input" type="number" min="0" step="0.01" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder={t("Deri", "Max")} /></div></div>
        <div className="filter-group"><strong>{t("Sasia në stok", "Quantity in stock")}</strong><div className="filter-range"><label className="sr-only" htmlFor="min-stock">{t("Stoku minimal", "Minimum stock")}</label><input id="min-stock" className="input" type="number" min="0" step="1" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder={t("Nga", "Min")} /><span>—</span><label className="sr-only" htmlFor="max-stock">{t("Stoku maksimal", "Maximum stock")}</label><input id="max-stock" className="input" type="number" min="0" step="1" value={maxStock} onChange={(e) => setMaxStock(e.target.value)} placeholder={t("Deri", "Max")} /></div></div>
        <fieldset className="filter-group sale-filters"><legend>{t("Mënyra e shitjes", "Available for")}</legend><label className="check-line"><input type="checkbox" checked={retailAvailable} onChange={(e) => setRetailAvailable(e.target.checked)} />{t("Me pakicë", "Individual / retail")}</label><label className="check-line"><input type="checkbox" checked={wholesaleAvailable} onChange={(e) => setWholesaleAvailable(e.target.checked)} />{t("Me shumicë", "Wholesale")}</label></fieldset>
        <button className="text-button clear-filter-button" onClick={clearFilters}>{t("Pastro të gjitha", "Clear all")}</button>
      </section>}
      {products.length ? (
        <div className="product-grid">
          {products.map((product) => {
            const stock = getStock(product);
            return (
              <article className="product-card" key={product.id}>
                <button className="product-photo" type="button" onClick={() => setEditing(product)} aria-label={`Edit ${product.name}`}>
                  {product.image ? <img src={product.image} alt="" /> : <span className="photo-placeholder">✳</span>}
                  <span className={`stock-label ${stock === 0 ? "stock-out" : stock < 5 ? "stock-low" : ""}`}>{stock === 0 ? t("Pa stok", "Out of stock") : stock < 5 ? t("Stok i ulët", "Low stock") : t("Në stok", "In stock")}</span>
                </button>
                <div className="product-card-content">
                  <div className="product-overline">{product.brand || product.category || "DRESS"}</div>
                  <div className="product-name-row"><h3>{product.name}</h3><button className="icon-button" aria-label={`Edit ${product.name}`} onClick={() => setEditing(product)}>···</button></div>
                  <div className="product-prices"><span>{euro.format(product.retailPrice)} <small>retail</small></span><span>{euro.format(product.wholesalePrice)} <small>wholesale</small></span></div>
                  <div className="product-card-footer">
                    <span>{stock} {t("copë", "units")} · {product.variants.length} {t("variante", "variants")}</span>
                    <span className="color-dots">{product.variants.slice(0, 4).map((variant) => <i key={variant.id} title={variant.color} aria-label={variant.color} style={{ backgroundColor: colorSwatches[variant.color.trim().toLocaleLowerCase()] ?? "#c4c6bc" }} />)}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState title={data.products.length ? t("Nuk ka produkte që përputhen", "No matching products") : t("Koleksioni juaj fillon këtu", "Your collection starts here")}>{data.products.length ? t("Ndryshoni ose pastroni kërkimin dhe filtrat.", "Adjust or clear the search and filters.") : t("Shtoni fustanin e parë, caktoni çmimet me pakicë e shumicë dhe ndiqni çdo ngjyrë e madhësi.", "Add your first dress, set its retail and wholesale prices, and track every color and size.")}</EmptyState>
      )}
      {editing !== undefined && <ProductEditor product={editing ?? undefined} onClose={() => setEditing(undefined)} />}
    </div>
  );
}
