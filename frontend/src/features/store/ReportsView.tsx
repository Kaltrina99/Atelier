import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { normalizeStoreData, tr, type Language, type Order, type OrderStatus } from "./model";
import { useStore } from "./StoreContext";
import { euro, PageHeader } from "./StoreUI";

type ReportKey = "sales" | "daily" | "channels" | "products" | "margin" | "inventory" | "stockAlerts" | "customers" | "topCustomers" | "statuses" | "pipeline" | "cancellations" | "checklist";

interface Report {
  key: ReportKey;
  title: string;
  description: string;
  headers: string[];
  rows: (string | number)[][];
  summary: { label: string; value: string }[];
  note: string;
}

function download(content: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function currentMonthRange(): [string, string] {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return [`${month}-01`, `${month}-${String(lastDay).padStart(2, "0")}`];
}

function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function excelCell(value: string | number): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<Cell><Data ss:Type="Number">${value}</Data></Cell>`;
  }
  return `<Cell><Data ss:Type="String">${escapeHtml(value)}</Data></Cell>`;
}

function statusName(status: OrderStatus, language: Language): string {
  const labels: Record<OrderStatus, [string, string]> = {
    new: ["E re", "New"],
    paid: ["E paguar", "Paid"],
    sent: ["Dërguar", "Sent"],
    delivered: ["Dorëzuar", "Delivered"],
    cancelled: ["Anuluar", "Cancelled"],
  };
  return labels[status][language === "sq" ? 0 : 1];
}

function orderTotal(order: Order): number {
  return order.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}

export function ReportsView() {
  const { data, commit } = useStore();
  const t = (sq: string, en: string) => tr(data.language, sq, en);
  const [initialStart, initialEnd] = currentMonthRange();
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [selectedReport, setSelectedReport] = useState<ReportKey>("sales");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const tax = data.tax;
  const dateRangeValid = startDate <= endDate;
  const inRange = (date: string) => date.slice(0, 10) >= startDate && date.slice(0, 10) <= endDate;
  const periodOrders = useMemo(() => data.orders.filter((order) => inRange(order.createdAt)), [data.orders, startDate, endDate]);
  const salesOrders = periodOrders.filter((order) => ["paid", "sent", "delivered"].includes(order.status));
  const salesLines = salesOrders.flatMap((order) => order.lines.map((line) => {
    const gross = line.unitPrice * line.quantity;
    const net = tax.pricesIncludeVat ? gross / (1 + tax.vatRate / 100) : gross;
    const vat = tax.pricesIncludeVat ? gross - net : gross * tax.vatRate / 100;
    return { order, line, net, vat, gross: tax.pricesIncludeVat ? gross : net + vat };
  }));
  const netTotal = salesLines.reduce((sum, row) => sum + row.net, 0);
  const vatTotal = salesLines.reduce((sum, row) => sum + row.vat, 0);
  const grossTotal = salesLines.reduce((sum, row) => sum + row.gross, 0);
  const itemCount = salesLines.reduce((sum, row) => sum + row.line.quantity, 0);

  const reports = useMemo<Report[]>(() => {
    const salesHeaders = [
      t("Emri i biznesit", "Business name"), t("Numri fiskal i biznesit", "Business fiscal number"),
      t("Numri i TVSH-së", "VAT number"), t("Numri i porosisë", "Order number"), t("Data", "Date"),
      t("Lloji i shitjes", "Sale type"), t("Statusi", "Order status"), t("Klienti", "Customer"),
      t("Numri fiskal i klientit", "Customer fiscal number"), t("Adresa e klientit", "Customer address"),
      t("Telefoni", "Customer phone"), "Email", t("Produkti", "Product"), "SKU",
      t("Ngjyra", "Color"), t("Madhësia", "Size"), t("Sasia", "Quantity"),
      t("Çmimi për njësi EUR", "Unit price EUR"), t("Norma orientuese e TVSH-së %", "Indicative VAT rate %"),
      t("Vlera pa TVSH EUR", "Net amount EUR"), t("TVSH orientuese EUR", "Indicative VAT EUR"),
      t("Vlera me TVSH EUR", "Gross amount EUR"), t("Shënimet e porosisë", "Order notes"),
    ];
    const salesRows = salesLines.map(({ order, line, net, vat, gross }) => [
      tax.businessName, tax.fiscalNumber, tax.vatNumber, order.number, order.createdAt.slice(0, 10),
      order.channel === "retail" ? t("Pakicë", "Retail") : t("Shumicë", "Wholesale"),
      statusName(order.status, data.language), order.customerName, order.customerFiscalNumber,
      order.customerAddress, order.customerPhone, order.customerEmail, line.productName, line.sku,
      line.color, line.size, line.quantity, line.unitPrice, tax.vatRate, net, vat, gross, order.notes,
    ] as (string | number)[]);

    const channelRows = (["retail", "wholesale"] as const).map((channel) => {
      const channelOrders = salesOrders.filter((order) => order.channel === channel);
      const lines = salesLines.filter((row) => row.order.channel === channel);
      const total = lines.reduce((sum, row) => sum + row.gross, 0);
      return [
        channel === "retail" ? t("Pakicë", "Retail") : t("Shumicë", "Wholesale"),
        channelOrders.length, lines.reduce((sum, row) => sum + row.line.quantity, 0),
        total, channelOrders.length ? total / channelOrders.length : 0,
      ];
    });

    const productSales = new Map<string, { name: string; brand: string; sku: string; quantity: number; gross: number }>();
    for (const row of salesLines) {
      const product = data.products.find((item) => item.id === row.line.productId);
      const current = productSales.get(row.line.productId) ?? {
        name: row.line.productName, brand: product?.brand ?? "", sku: row.line.sku, quantity: 0, gross: 0,
      };
      current.quantity += row.line.quantity;
      current.gross += row.gross;
      productSales.set(row.line.productId, current);
    }
    const productRows = [...productSales.entries()].map(([id, sold]) => {
      const product = data.products.find((item) => item.id === id);
      const stock = product?.variants.reduce((sum, variant) => sum + variant.stock, 0) ?? 0;
      return [sold.name, sold.brand, sold.sku, sold.quantity, sold.gross, stock];
    }).sort((a, b) => Number(b[4]) - Number(a[4]));

    const inventoryRows = data.products.flatMap((product) => product.variants.map((variant) => [
      product.name, product.brand, product.sku, variant.color, variant.size, variant.stock,
      product.costPrice, variant.stock * product.costPrice, product.retailPrice,
      variant.stock * product.retailPrice, product.wholesalePrice, variant.stock * product.wholesalePrice,
    ]));
    const stockUnits = data.products.reduce((sum, product) => sum + product.variants.reduce((count, variant) => count + variant.stock, 0), 0);
    const inventoryCost = data.products.reduce((sum, product) => sum + product.variants.reduce((count, variant) => count + variant.stock, 0) * product.costPrice, 0);
    const retailValue = data.products.reduce((sum, product) => sum + product.variants.reduce((count, variant) => count + variant.stock, 0) * product.retailPrice, 0);

    const customerRows = salesOrders.map((order) => [
      order.createdAt.slice(0, 10), order.number, order.customerName, order.customerFiscalNumber,
      order.customerPhone, order.customerEmail, order.customerAddress,
      order.channel === "retail" ? t("Pakicë", "Retail") : t("Shumicë", "Wholesale"),
      statusName(order.status, data.language), order.lines.reduce((sum, line) => sum + line.quantity, 0),
      orderTotal(order), order.notes,
    ]);

    const statuses: OrderStatus[] = ["new", "paid", "sent", "delivered", "cancelled"];
    const statusRows = statuses.map((status) => {
      const matched = periodOrders.filter((order) => order.status === status);
      return [
        statusName(status, data.language), matched.length,
        matched.reduce((sum, order) => sum + order.lines.reduce((count, line) => count + line.quantity, 0), 0),
        matched.reduce((sum, order) => sum + orderTotal(order), 0),
      ];
    });

    const dailySales = new Map<string, { orders: Set<string>; quantity: number; gross: number }>();
    for (const row of salesLines) {
      const date = row.order.createdAt.slice(0, 10);
      const current = dailySales.get(date) ?? { orders: new Set<string>(), quantity: 0, gross: 0 };
      current.orders.add(row.order.id);
      current.quantity += row.line.quantity;
      current.gross += row.gross;
      dailySales.set(date, current);
    }
    const dailyRows = [...dailySales.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, summary]) => [
      date, summary.orders.size, summary.quantity, summary.gross,
      summary.orders.size ? summary.gross / summary.orders.size : 0,
    ]);

    const customerSales = new Map<string, { name: string; fiscalNumber: string; phone: string; email: string; orders: number; quantity: number; gross: number; firstDate: string; lastDate: string }>();
    for (const order of salesOrders) {
      const name = order.customerName.trim();
      const identity = order.customerFiscalNumber.trim().toLowerCase()
        || order.customerPhone.replace(/\D/g, "")
        || order.customerEmail.trim().toLowerCase()
        || (name && name !== t("Klient në dyqan", "Walk-in customer") ? name.toLowerCase() : order.id);
      const current = customerSales.get(identity) ?? {
        name, fiscalNumber: order.customerFiscalNumber, phone: order.customerPhone, email: order.customerEmail,
        orders: 0, quantity: 0, gross: 0, firstDate: order.createdAt.slice(0, 10), lastDate: order.createdAt.slice(0, 10),
      };
      current.orders += 1;
      current.quantity += order.lines.reduce((sum, line) => sum + line.quantity, 0);
      current.gross += orderTotal(order);
      current.firstDate = order.createdAt.slice(0, 10) < current.firstDate ? order.createdAt.slice(0, 10) : current.firstDate;
      current.lastDate = order.createdAt.slice(0, 10) > current.lastDate ? order.createdAt.slice(0, 10) : current.lastDate;
      customerSales.set(identity, current);
    }
    const topCustomerRows = [...customerSales.values()].sort((a, b) => b.gross - a.gross).map((customer) => [
      customer.name, customer.fiscalNumber, customer.phone, customer.email,
      customer.orders, customer.quantity, customer.gross,
      customer.orders ? customer.gross / customer.orders : 0, customer.firstDate, customer.lastDate,
    ]);

    const marginRows = [...productSales.entries()].map(([id, sold]) => {
      const product = data.products.find((item) => item.id === id);
      const estimatedCost = product ? product.costPrice * sold.quantity : 0;
      const estimatedMargin = sold.gross - estimatedCost;
      return [
        sold.name, sold.brand, sold.sku, sold.quantity, sold.gross,
        product?.costPrice ?? 0, estimatedCost, estimatedMargin,
        sold.gross ? estimatedMargin / sold.gross * 100 : 0,
      ];
    }).sort((a, b) => Number(b[7]) - Number(a[7]));
    const estimatedCostOfSold = marginRows.reduce((sum, row) => sum + Number(row[6]), 0);
    const estimatedMargin = grossTotal - estimatedCostOfSold;

    const stockAlertRows = data.products.flatMap((product) => product.variants
      .filter((variant) => variant.stock <= 5)
      .map((variant) => [
        product.name, product.brand, product.sku, variant.color, variant.size,
        variant.stock, variant.stock === 0 ? t("Pa stok", "Out of stock") : t("Stok i ulët", "Low stock"),
        Math.max(0, 5 - variant.stock), product.costPrice * Math.max(0, 5 - variant.stock),
      ]))
      .sort((a, b) => Number(a[5]) - Number(b[5]));
    const cancelledOrders = periodOrders.filter((order) => order.status === "cancelled");
    const pipelineOrders = periodOrders.filter((order) => order.status === "new" || order.status === "paid" || order.status === "sent");

    const checklistRows = [
      [t("Profili i biznesit", "Business profile"), tax.businessName && tax.fiscalNumber ? t("Plotësuar", "Entered") : t("Mungojnë të dhënat", "Details missing"), `${t("Emri", "Name")}: ${tax.businessName || "—"}; ${t("Nr. fiskal", "Fiscal no.")}: ${tax.fiscalNumber || "—"}; ${t("Nr. TVSH", "VAT no.")}: ${tax.vatNumber || "—"}`, t("Konfirmoni të dhënat e regjistrimit me kontabilistin.", "Confirm registered details with your accountant.")],
      [t("Regjistri i shitjeve", "Sales register"), salesOrders.length ? t("Ka të dhëna", "Data available") : t("Pa shitje të kualifikuara", "No qualifying sales"), `${salesOrders.length} ${t("porosi", "orders")}; ${euro.format(grossTotal)} ${t("vlerë bruto e porosive", "gross order value")}`, t("Kontrolloni faturat dhe dëshmitë fiskale veçmas.", "Reconcile with invoices and fiscal receipts separately.")],
      [t("Stoku aktual", "Current inventory"), data.products.length ? t("Ka të dhëna", "Data available") : t("Katalogu bosh", "Catalogue is empty"), `${stockUnits} ${t("copë", "units")}; ${euro.format(inventoryCost)} ${t("kosto e vlerësuar", "estimated cost value")}`, t("Nuk ka histori të stokut hapës ose lëvizjeve hyrëse.", "Opening stock and incoming stock movement history are not recorded.")],
      [t("Faturat e blerjes dhe furnitorët", "Purchase invoices and suppliers"), t("Nuk regjistrohen", "Not recorded"), t("Nuk ruhen faturat, numrat fiskalë të furnitorëve apo TVSH-ja hyrëse.", "Supplier invoices, fiscal numbers, and input VAT are not stored."), t("Regjistroni dhe rakordoni librin e blerjeve jashtë këtij raporti.", "Maintain and reconcile the purchase book separately.")],
      [t("Shpenzimet dhe pagesat", "Expenses and payments"), t("Nuk regjistrohen", "Not recorded"), t("Nuk ruhen shpenzimet operative, arkëtimet reale, borxhet apo pagesat bankare.", "Operating expenses, cash collected, receivables, and bank payments are not stored."), t("Mos i trajtoni vlerat e porosive si pagesa të pranuara.", "Do not treat order values as cash collected.")],
      [t("Normat e TVSH-së", "VAT rates"), t("Një normë e vetme", "Single rate"), `${tax.vatRate}% ${tax.pricesIncludeVat ? t("çmimet përfshijnë TVSH", "prices include VAT") : t("TVSH llogaritet mbi çmimet", "VAT is added to prices")}`, t("Verifikoni normën dhe trajtimin për secilin transaksion.", "Verify the rate and treatment for each transaction.")],
      [t("Deklarimet / fiskalizimi", "Returns / fiscalization"), t("Nuk integrohen", "Not integrated"), t("Aplikacioni nuk dërgon deklarata në EDI dhe nuk lëshon kupon fiskal.", "The app does not submit EDI returns or issue fiscal receipts."), t("Kontrolloni formularët dhe afatet aktuale drejtpërdrejt te ATK.", "Check current forms and deadlines directly with TAK.")],
    ] as (string | number)[][];

    return [
      {
        key: "sales", title: t("Libri i shitjeve", "Sales register"),
        description: t("Shitjet e shënuara si të paguara, dërguara ose dorëzuara, me të dhënat e porosisë dhe klientit.", "Orders marked paid, sent, or delivered, with order and customer details."),
        headers: salesHeaders, rows: salesRows,
        summary: [
          { label: t("Porosi", "Orders"), value: String(salesOrders.length) },
          { label: t("Artikuj", "Units sold"), value: String(itemCount) },
          { label: t("Vlera neto*", "Net value*"), value: euro.format(netTotal) },
          { label: t("TVSH orientuese*", "Indicative VAT*"), value: euro.format(vatTotal) },
          { label: t("Vlera bruto*", "Gross value*"), value: euro.format(grossTotal) },
        ],
        note: t("Vlerat tatimore janë orientuese: aplikojnë një normë të vetme të konfiguruar për çdo artikull. Nuk janë libër fiskal apo deklaratë zyrtare.", "Tax amounts are indicative: one configured rate is applied to every item. This is not a fiscal book or official return."),
      },
      {
        key: "daily", title: t("Shitjet ditore", "Daily sales"),
        description: t("Trendi i porosive, artikujve dhe vlerës mesatare të shitjes për secilën ditë.", "Daily trend in orders, units, and average order value."),
        headers: [t("Data", "Date"), t("Porosi", "Orders"), t("Artikuj", "Units"), t("Vlera bruto EUR", "Gross value EUR"), t("Mesatarja për porosi EUR", "Average per order EUR")],
        rows: dailyRows,
        summary: [{ label: t("Ditë me shitje", "Days with sales"), value: String(dailyRows.length) }, { label: t("Porosi", "Orders"), value: String(salesOrders.length) }, { label: t("Vlera bruto*", "Gross value*"), value: euro.format(grossTotal) }],
        note: t("Përfshin vetëm porositë me status të paguar, dërguar ose dorëzuar; nuk është pajtim i arkës apo bankës.", "Includes only paid, sent, or delivered orders; it is not a cash or bank reconciliation."),
      },
      {
        key: "channels", title: t("Shitjet sipas kanalit", "Sales by channel"),
        description: t("Krahasoni shitjet me pakicë dhe shumicë brenda periudhës.", "Compare retail and wholesale sales for the selected period."),
        headers: [t("Kanali", "Channel"), t("Porosi", "Orders"), t("Artikuj", "Units"), t("Vlera bruto e porosive EUR", "Gross order value EUR"), t("Mesatarja për porosi EUR", "Average per order EUR")],
        rows: channelRows,
        summary: [{ label: t("Vlera e shitjeve*", "Sales value*"), value: euro.format(grossTotal) }, { label: t("Porosi", "Orders"), value: String(salesOrders.length) }],
        note: t("Vlera e porosive nuk konfirmon se paratë janë arkëtuar; aplikacioni nuk regjistron arkëtimet apo mënyrën e pagesës.", "Order values do not confirm payment collection; the app does not record receipts or payment methods."),
      },
      {
        key: "products", title: t("Shitjet sipas produktit", "Sales by product"),
        description: t("Sasitë dhe vlerat e regjistruara për produktet e shitura.", "Recorded quantities and values for products sold."),
        headers: [t("Produkti", "Product"), t("Brendi", "Brand"), "SKU", t("Sasia e shitur", "Units sold"), t("Vlera bruto EUR", "Gross value EUR"), t("Stoku aktual", "Current stock")],
        rows: productRows,
        summary: [{ label: t("Artikuj të shitur", "Units sold"), value: String(itemCount) }, { label: t("Vlera bruto*", "Gross value*"), value: euro.format(grossTotal) }],
        note: t("Çmimet historike të blerjes nuk ruhen në rreshtat e porosisë, prandaj ky raport nuk llogarit fitimin apo koston e shitjeve.", "Historical purchase costs are not stored on order lines, so this report does not calculate profit or cost of sales."),
      },
      {
        key: "margin", title: t("Marzhi i përafërt sipas produktit", "Indicative product margin"),
        description: t("Krahason të ardhurat bruto të porosive me koston aktuale të produktit në katalog.", "Compares gross order value with the product's current catalogue cost."),
        headers: [t("Produkti", "Product"), t("Brendi", "Brand"), "SKU", t("Sasia", "Units"), t("Vlera e shitjes EUR", "Sales value EUR"), t("Kosto aktuale/njësi EUR", "Current unit cost EUR"), t("Kosto e vlerësuar EUR", "Estimated cost EUR"), t("Marzhi i vlerësuar EUR", "Estimated margin EUR"), t("Marzhi %", "Margin %")],
        rows: marginRows,
        summary: [{ label: t("Vlera bruto e porosive*", "Gross order value*"), value: euro.format(grossTotal) }, { label: t("Kosto e vlerësuar*", "Estimated cost*"), value: euro.format(estimatedCostOfSold) }, { label: t("Marzh bruto i vlerësuar*", "Estimated gross margin*"), value: euro.format(estimatedMargin) }],
        note: t("Jo fitim kontabël: llogaritja përdor koston aktuale, jo koston e lotit të blerë në datën e shitjes. Nuk përfshin shpenzime, zbritje, kthime apo trajtim tatimor.", "Not accounting profit: this uses current cost, not the cost of the purchased batch at the sale date. It excludes expenses, discounts, returns, and tax treatment."),
      },
      {
        key: "inventory", title: t("Stoku dhe vlerësimi", "Inventory and valuation"),
        description: t("Gjendja aktuale sipas ngjyrës dhe madhësisë, me vlerësim nga kostot e futura në katalog.", "Current stock by color and size, valued using costs entered in the catalogue."),
        headers: [t("Produkti", "Product"), t("Brendi", "Brand"), "SKU", t("Ngjyra", "Color"), t("Madhësia", "Size"), t("Stoku", "Stock"), t("Kosto/njësi EUR", "Unit cost EUR"), t("Vlera me kosto EUR", "Cost value EUR"), t("Çmimi pakicë EUR", "Retail price EUR"), t("Vlera pakicë EUR", "Retail value EUR"), t("Çmimi shumicë EUR", "Wholesale price EUR"), t("Vlera shumicë EUR", "Wholesale value EUR")],
        rows: inventoryRows,
        summary: [
          { label: t("Copë në stok", "Units on hand"), value: String(stockUnits) },
          { label: t("Vlera e kostos*", "Estimated cost value*"), value: euro.format(inventoryCost) },
          { label: t("Vlera e mundshme me pakicë*", "Potential retail value*"), value: euro.format(retailValue) },
        ],
        note: t("Fotografi e stokut aktual, jo libër lëvizjesh. Vlerësimi përdor koston aktuale të produktit; verifikoni metodën kontabël, stokun hapës dhe blerjet me kontabilistin.", "Snapshot of current stock, not a movement ledger. Valuation uses current product cost; reconcile the accounting method, opening stock, and purchases with your accountant."),
      },
      {
        key: "stockAlerts", title: t("Stok i ulët dhe rimbushje", "Low stock and replenishment"),
        description: t("Variantet me pesë ose më pak copë dhe sasia orientuese për t'u kthyer në pesë.", "Variants with five or fewer units and an indicative quantity to reach five."),
        headers: [t("Produkti", "Product"), t("Brendi", "Brand"), "SKU", t("Ngjyra", "Color"), t("Madhësia", "Size"), t("Stoku", "Stock"), t("Gjendja", "Status"), t("Sasia orientuese për 5", "Suggested qty to 5"), t("Kosto orientuese EUR", "Indicative cost EUR")],
        rows: stockAlertRows,
        summary: [{ label: t("Variante me stok të ulët", "Low-stock variants"), value: String(stockAlertRows.length) }, { label: t("Pa stok", "Out of stock"), value: String(stockAlertRows.filter((row) => row[5] === 0).length) }, { label: t("Kosto e sugjeruar*", "Suggested cost*"), value: euro.format(stockAlertRows.reduce((sum, row) => sum + Number(row[8]), 0)) }],
        note: t("Pragu 5 është orientues dhe nuk parashikon kërkesën. Sasia/kostoja nuk janë porosi blerjeje dhe nuk përfshijnë sasitë minimale të furnitorit.", "The threshold of 5 is indicative and does not forecast demand. Suggested quantities/cost are not purchase orders and exclude supplier minimums."),
      },
      {
        key: "customers", title: t("Aktiviteti i klientëve", "Customer sales activity"),
        description: t("Porositë e shitjeve të kualifikuara sipas klientit dhe dokumentit.", "Qualifying sales orders by customer and document."),
        headers: [t("Data", "Date"), t("Porosia", "Order"), t("Klienti", "Customer"), t("Numri fiskal", "Fiscal number"), t("Telefoni", "Phone"), "Email", t("Adresa", "Address"), t("Kanali", "Channel"), t("Statusi", "Status"), t("Artikuj", "Units"), t("Vlera e porosisë EUR", "Order value EUR"), t("Shënimet", "Notes")],
        rows: customerRows,
        summary: [{ label: t("Porosi", "Orders"), value: String(salesOrders.length) }, { label: t("Klientë të shënuar", "Customers recorded"), value: String(new Set(salesOrders.map((order) => `${order.customerFiscalNumber}|${order.customerName}`)).size) }],
        note: t("Raport aktiviteti, jo libër i llogarive të arkëtueshme: nuk regjistrohen faturat me afat, pagesat, kreditë apo saldoja e klientit.", "Activity report, not an accounts-receivable ledger: due invoices, payments, credits, and customer balances are not recorded."),
      },
      {
        key: "topCustomers", title: t("Klientët sipas vlerës së shitjeve", "Customers by sales value"),
        description: t("Rendit klientët e identifikueshëm sipas vlerës së porosive të kualifikuara.", "Ranks identifiable customers by qualifying order value."),
        headers: [t("Klienti", "Customer"), t("Numri fiskal", "Fiscal number"), t("Telefoni", "Phone"), "Email", t("Porosi", "Orders"), t("Artikuj", "Units"), t("Vlera bruto EUR", "Gross value EUR"), t("Mesatarja për porosi EUR", "Average order EUR"), t("Porosia e parë", "First order"), t("Porosia e fundit", "Last order")],
        rows: topCustomerRows,
        summary: [{ label: t("Klientë të identifikueshëm", "Identifiable customers"), value: String(topCustomerRows.length) }, { label: t("Klientë me përsëritje", "Repeat customers"), value: String(topCustomerRows.filter((row) => Number(row[4]) > 1).length) }],
        note: t("Vlera bazohet në porosi, jo në pagesa të pranuara. Klientët pa identifikues kontakti/fiskal dhe klientët pa emër identifikues nuk mund të bashkohen me siguri.", "Values are based on orders, not collected payments. Customers without contact/fiscal identifiers and identifiable names cannot be reliably merged."),
      },
      {
        key: "statuses", title: t("Përmbledhja e porosive", "Order status summary"),
        description: t("Të gjitha porositë brenda periudhës, të ndara sipas statusit.", "All orders in the period, grouped by status."),
        headers: [t("Statusi", "Status"), t("Porosi", "Orders"), t("Artikuj", "Units"), t("Vlera e porosive EUR", "Order value EUR")],
        rows: statusRows,
        summary: [{ label: t("Porosi gjithsej", "Total orders"), value: String(periodOrders.length) }, { label: t("Vlera jo të anuluara*", "Non-cancelled order value*"), value: euro.format(periodOrders.filter((order) => order.status !== "cancelled").reduce((sum, order) => sum + orderTotal(order), 0)) }],
        note: t("Statusi i porosisë nuk është provë pagese apo zëvendësim i faturës fiskale.", "Order status is not proof of payment or a substitute for a fiscal invoice."),
      },
      {
        key: "pipeline", title: t("Porositë për përfundim", "Orders to fulfill"),
        description: t("Porositë aktive të reja, të paguara ose të dërguara në periudhën e zgjedhur.", "Active new, paid, or sent orders within the selected period."),
        headers: [t("Data", "Date"), t("Porosia", "Order"), t("Klienti", "Customer"), t("Telefoni", "Phone"), t("Kanali", "Channel"), t("Statusi", "Status"), t("Artikuj", "Units"), t("Vlera e porosisë EUR", "Order value EUR"), t("Shënimet", "Notes")],
        rows: pipelineOrders.map((order) => [
          order.createdAt.slice(0, 10), order.number, order.customerName, order.customerPhone,
          order.channel === "retail" ? t("Pakicë", "Retail") : t("Shumicë", "Wholesale"),
          statusName(order.status, data.language), order.lines.reduce((sum, line) => sum + line.quantity, 0), orderTotal(order), order.notes,
        ]),
        summary: [{ label: t("Porosi aktive", "Active orders"), value: String(pipelineOrders.length) }, { label: t("Vlera e porosive*", "Order value*"), value: euro.format(pipelineOrders.reduce((sum, order) => sum + orderTotal(order), 0)) }],
        note: t("Kërkon kontroll manual: aplikacioni nuk ruan afatin e dorëzimit, numrin e gjurmimit, arkëtimin ose saldo të papaguar.", "Requires manual review: the app does not store delivery deadlines, tracking numbers, collected payments, or outstanding balances."),
      },
      {
        key: "cancellations", title: t("Porositë e anuluara", "Cancelled orders"),
        description: t("Detajet e porosive të shënuara si të anuluara në periudhën.", "Details of orders marked cancelled during the period."),
        headers: [t("Data", "Date"), t("Porosia", "Order"), t("Klienti", "Customer"), t("Kanali", "Channel"), t("Artikuj", "Units"), t("Vlera e porosisë EUR", "Order value EUR"), t("Shënimet", "Notes")],
        rows: cancelledOrders.map((order) => [
          order.createdAt.slice(0, 10), order.number, order.customerName,
          order.channel === "retail" ? t("Pakicë", "Retail") : t("Shumicë", "Wholesale"),
          order.lines.reduce((sum, line) => sum + line.quantity, 0), orderTotal(order), order.notes,
        ]),
        summary: [{ label: t("Porosi të anuluara", "Cancelled orders"), value: String(cancelledOrders.length) }, { label: t("Vlera bruto e porosive*", "Gross order value*"), value: euro.format(cancelledOrders.reduce((sum, order) => sum + orderTotal(order), 0)) }],
        note: t("Vlera e listuar nuk është rimbursim apo humbje e konfirmuar. Regjistroni kthimet/rimbursimet dhe pajtojini me dokumentet burimore veçmas.", "Listed values are not confirmed refunds or losses. Record returns/refunds and reconcile them with source documents separately."),
      },
      {
        key: "checklist", title: t("Kontrolli për kontabilistin", "Accountant handoff checklist"),
        description: t("Të dhënat e përfshira dhe regjistrat që duhen mbajtur veçmas para përgatitjes së deklarimeve.", "Available data and records that must be maintained separately before preparing returns."),
        headers: [t("Regjistri", "Area"), t("Gjendja", "Coverage"), t("Të dhënat në aplikacion", "Data in app"), t("Kontroll / veprim i nevojshëm", "Check / follow-up needed")],
        rows: checklistRows,
        summary: [{ label: t("Shitje në periudhë", "Sales in period"), value: String(salesOrders.length) }, { label: t("Produkte në katalog", "Products in catalogue"), value: String(data.products.length) }],
        note: t("Kjo listë ndihmon dorëzimin e të dhënave; nuk vërteton pajtueshmërinë me ligjin apo plotësimin e detyrimeve të ATK-së.", "This checklist supports data handoff; it does not certify legal compliance or fulfillment of ATK obligations."),
      },
    ];
  }, [data.language, data.orders, data.products, periodOrders, salesLines, salesOrders, tax.businessName, tax.fiscalNumber, tax.pricesIncludeVat, tax.vatNumber, tax.vatRate, itemCount, netTotal, vatTotal, grossTotal, startDate, endDate]);

  const report = reports.find((item) => item.key === selectedReport) ?? reports[0];
  const period = `${startDate} — ${endDate}`;
  const reportPeriod = report.key === "inventory" ? t("Gjendja aktuale", "Current snapshot") : period;
  const reportFilePeriod = report.key === "inventory" ? new Date().toISOString().slice(0, 10) : `${startDate}-${endDate}`;

  const updateVatRate = (value: string) => {
    const rate = Number(value);
    if (!value.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      setError(t("Shënoni normë të TVSH-së nga 0 deri në 100%.", "Enter a VAT rate between 0 and 100%."));
      return;
    }
    setError("");
    void commit((current) => ({ ...current, tax: { ...current.tax, vatRate: rate } }));
  };

  const exportExcel = () => {
    const headerRow = `<Row>${report.headers.map(excelCell).join("")}</Row>`;
    const dataRows = report.rows.map((row) => `<Row>${row.map(excelCell).join("")}</Row>`).join("");
    const summaryRows = report.summary.map(({ label, value }) => `<Row>${excelCell(label)}${excelCell(value)}</Row>`).join("");
    const sheetName = report.title.replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Report";
    const sheet = `<?xml version="1.0" encoding="UTF-8"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${escapeHtml(sheetName)}"><Table>${headerRow}${dataRows}${summaryRows}</Table></Worksheet></Workbook>`;
    download(sheet, "application/vnd.ms-excel;charset=utf-8", `atelier-${report.key}-${reportFilePeriod}.xls`);
    setMessage(t("U shkarkua raporti Excel.", "Excel report downloaded."));
  };

  const exportWord = () => {
    const summary = report.summary.map(({ label, value }) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("");
    const rows = report.rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("");
    const word = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#202820}h1{font-size:20pt}p{color:#555}table{border-collapse:collapse;font-size:8pt;width:100%}th,td{border:1px solid #bbb;padding:5px;text-align:left}th{background:#e8eee1}</style></head><body><h1>${escapeHtml(report.title)}</h1><p>${escapeHtml(t("Periudha", "Period"))}: ${escapeHtml(reportPeriod)} · ${escapeHtml(tax.businessName)} · ${escapeHtml(t("Numri fiskal", "Fiscal number"))}: ${escapeHtml(tax.fiscalNumber)}</p>${summary}<p><strong>${escapeHtml(report.note)}</strong></p><table><thead><tr>${report.headers.map((value) => `<th>${escapeHtml(value)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
    download(`\uFEFF${word}`, "application/msword;charset=utf-8", `atelier-${report.key}-${reportFilePeriod}.doc`);
    setMessage(t("U shkarkua raporti Word.", "Word report downloaded."));
  };

  const exportPdf = () => {
    window.print();
    setMessage(t("Përdorni opsionin “Ruaj si PDF” në dritaren e shtypjes.", "Choose “Save as PDF” in the print dialog."));
  };

  const exportBackup = () => {
    download(JSON.stringify(data, null, 2), "application/json", `backup-butik-${currentMonthRange()[0].slice(0, 7)}.json`);
    setMessage(t("U shkarkua kopja rezervë. Ruajeni në një vend të sigurt.", "Backup downloaded. Save it somewhere safe."));
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported: unknown = JSON.parse(await file.text());
      const storeBackup = normalizeStoreData(imported);
      if (!storeBackup) throw new Error(t("Skedari nuk duket si kopje rezervë e kësaj aplikacioni.", "This file does not look like a backup from this app."));
      if (!await commit(storeBackup)) return;
      setError("");
      setMessage(t("Kopja rezervë u rikthye.", "Backup restored."));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("Nuk mund të lexojmë kopjen rezervë.", "The backup could not be read."));
      setMessage("");
    }
  };

  const reportOptions: { key: ReportKey; label: string }[] = [
    { key: "sales", label: t("Libri i shitjeve", "Sales register") },
    { key: "daily", label: t("Shitjet ditore", "Daily sales") },
    { key: "channels", label: t("Shitjet sipas kanalit", "Sales by channel") },
    { key: "products", label: t("Shitjet sipas produktit", "Sales by product") },
    { key: "margin", label: t("Marzhi i përafërt", "Indicative margin") },
    { key: "inventory", label: t("Stoku dhe vlerësimi", "Inventory and valuation") },
    { key: "stockAlerts", label: t("Stok i ulët dhe rimbushje", "Low stock and replenishment") },
    { key: "customers", label: t("Aktiviteti i klientëve", "Customer sales activity") },
    { key: "topCustomers", label: t("Klientët sipas vlerës", "Customers by value") },
    { key: "statuses", label: t("Përmbledhja e porosive", "Order status summary") },
    { key: "pipeline", label: t("Porositë për përfundim", "Orders to fulfill") },
    { key: "cancellations", label: t("Porositë e anuluara", "Cancelled orders") },
    { key: "checklist", label: t("Kontrolli për kontabilistin", "Accountant handoff checklist") },
  ];

  return (
    <div className="view">
      <PageHeader eyebrow={t("TATIME & KONTABILITET", "TAX & ACCOUNTING")} title={t("Raportet për kontabilistin", "Accountant reports")} description={t("Regjistra shitjesh, klientësh dhe stoku për periudhën e zgjedhur.", "Sales, customer, and inventory reports for the selected period.")} />
      <div className="notice-banner"><span>i</span><p><strong>{t("Raporte ndihmëse, jo deklarata zyrtare.", "Management reports, not official returns.")}</strong> {t("Raportet përdorin vetëm të dhënat e regjistruara në aplikacion. Blerjet, shpenzimet, pagesat reale, pagat, lëvizjet historike të stokut dhe deklarimet në EDI nuk regjistrohen këtu. Konfirmoni formularët, afatet dhe detyrimet aktuale me kontabilistin dhe ATK-në.", "Reports use only data recorded in the app. Purchases, expenses, actual payments, payroll, historical stock movements, and EDI filings are not recorded here. Confirm current forms, deadlines, and obligations with your accountant and ATK.")}</p></div>

      <section className="settings-card">
        <div className="section-title"><div><strong>{t("Profili i biznesit dhe TVSH-së", "Business and VAT profile")}</strong><small>{t("Përdoret në raportet tuaja", "Shown in your reports")}</small></div><span className="soft-chip">{t("Biznes individual (B.I.)", "Individual business (B.I.)")}</span></div>
        <div className="form-grid tax-grid">
          <label className="control"><span>{t("Emri i biznesit", "Business name")}</span><input className="input" value={tax.businessName} onChange={(e) => void commit((current) => ({ ...current, tax: { ...current.tax, businessName: e.target.value } }))} placeholder={t("Emri i regjistruar i biznesit", "Registered business name")} /></label>
          <label className="control"><span>{t("Numri fiskal", "Fiscal number")}</span><input className="input" value={tax.fiscalNumber} onChange={(e) => void commit((current) => ({ ...current, tax: { ...current.tax, fiscalNumber: e.target.value } }))} /></label>
          <label className="control"><span>{t("Numri i TVSH-së", "VAT number")}</span><input className="input" value={tax.vatNumber} onChange={(e) => void commit((current) => ({ ...current, tax: { ...current.tax, vatNumber: e.target.value } }))} /></label>
          <label className="control"><span>{t("Norma orientuese e TVSH-së (%)", "Indicative VAT rate (%)")}</span><input className="input" type="number" min="0" max="100" step="0.01" value={tax.vatRate} onChange={(e) => updateVatRate(e.target.value)} /></label>
        </div>
        <label className="check-line"><input type="checkbox" checked={tax.pricesIncludeVat} onChange={(e) => void commit((current) => ({ ...current, tax: { ...current.tax, pricesIncludeVat: e.target.checked } }))} /><span>{t("Çmimet e shitjes të futura në porosi përfshijnë TVSH-në", "Sale prices entered on orders include VAT")}</span></label>
        <p className="settings-footnote">{t("Një normë e vetme përdoret vetëm për vlerësim të përafërt; aplikacioni nuk ruan normën tatimore për artikull apo faturë.", "A single rate is used only for an approximate estimate; the app does not store tax rates per item or invoice.")}</p>
      </section>

      <div className="report-toolbar accountant-toolbar">
        <div className="accountant-filters">
          <label className="control"><span>{t("Nga data", "From")}</span><input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label className="control"><span>{t("Deri më", "Through")}</span><input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
          <label className="control report-picker"><span>{t("Lloji i raportit", "Report type")}</span><select className="input" value={selectedReport} onChange={(e) => setSelectedReport(e.target.value as ReportKey)}>{reportOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
        </div>
        <div className="report-actions hide-print">
          <button className="button button-light" onClick={exportBackup}>{t("Kopja rezervë", "Backup")}</button>
          <button className="button button-light" onClick={() => importRef.current?.click()}>{t("Importo kopje", "Import backup")}</button>
          <input ref={importRef} className="sr-only" type="file" accept="application/json,.json" onChange={(e) => void importBackup(e)} />
          <button className="button button-light" onClick={exportWord}>{t("Shkarko Word", "Download Word")}</button>
          <button className="button button-light" onClick={exportExcel}>{t("Shkarko Excel", "Download Excel")}</button>
          <button className="button button-dark" onClick={exportPdf}>{t("Ruaj si PDF", "Save as PDF")}</button>
        </div>
      </div>
      {!dateRangeValid && <p className="form-error" role="alert">{t("Data e fillimit duhet të jetë para datës së përfundimit.", "The start date must be on or before the end date.")}</p>}
      {message && <p className="success-message" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="accountant-report">
        <div className="accountant-report-heading"><div><div className="eyebrow">{reportPeriod}</div><h2>{report.title}</h2><p>{report.description}</p></div><span className="soft-chip">{report.rows.length} {t("rreshta", "rows")}</span></div>
        <div className="tax-summary accountant-summary">{report.summary.map((item) => <div className="tax-stat" key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
        <p className="report-footnote accountant-report-note">{report.note}</p>
        <div className="table-scroll"><table className="data-table report-table"><thead><tr>{report.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{report.rows.map((row, index) => <tr key={index}>{row.map((value, cell) => <td key={cell}>{value}</td>)}</tr>)}</tbody></table>{report.rows.length === 0 && <div className="table-empty">{t("Nuk ka të dhëna për këtë periudhë.", "No records for this period.")}</div>}</div>
      </section>

      <section className="official-links hide-print"><div><strong>{t("Burime zyrtare të ATK-së", "Official ATK resources")}</strong><small>{t("Për formularë dhe legjislacion, kontrolloni faqet zyrtare të ATK-së.", "Check official ATK pages for forms and legislation.")}</small></div><a href="https://www.atk-ks.org/formularet/" target="_blank" rel="noreferrer">{t("Formularët e ATK-së", "ATK forms")} ↗</a><a href="https://www.atk-ks.org/en/legislation/laws/" target="_blank" rel="noreferrer">{t("Legjislacioni", "Legislation")} ↗</a><a href="https://www.atk-ks.org/en/arkat-fiskale/" target="_blank" rel="noreferrer">{t("Arkat fiskale", "Fiscal cash registers")} ↗</a></section>
    </div>
  );
}
