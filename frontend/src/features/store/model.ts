export type SaleChannel = "retail" | "wholesale";
export type OrderStatus = "new" | "paid" | "sent" | "delivered" | "cancelled";
export type Language = StoreData["language"];

export interface ProductVariant {
  id: string;
  color: string;
  size: string;
  stock: number;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  sku: string;
  category: string;
  description: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  image: string | null;
  variants: ProductVariant[];
  createdAt: string;
}

export interface OrderLine {
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  number: string;
  createdAt: string;
  channel: SaleChannel;
  status: OrderStatus;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerFiscalNumber: string;
  customerAddress: string;
  notes: string;
  lines: OrderLine[];
}

export interface CollectionReminder {
  id: string;
  customerName: string;
  phone: string;
  whatsappOptIn?: boolean;
  viberOptIn?: boolean;
  consentCapturedAt?: string;
  viberIntroConfirmed?: boolean;
  whatsappSentAt?: string;
  whatsappMessageId?: string;
  whatsappSendStatus?: "accepted" | "failed" | "unknown";
  viberSentAt?: string;
  viberMessageId?: string;
  viberSendStatus?: "accepted" | "failed" | "unknown";
  openedAt?: string;
}

export interface ProductCollection {
  id: string;
  name: string;
  description: string;
  arrivalDate: string;
  productIds: string[];
  reminders: CollectionReminder[];
  createdAt: string;
}

export type InstagramMediaType = "post" | "reel" | "story";
export type InstagramPostStatus = "planned" | "published";

export interface InstagramPost {
  id: string;
  caption: string;
  postUrl: string;
  mediaType: InstagramMediaType;
  status: InstagramPostStatus;
  postDate: string;
  productIds: string[];
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  profileVisits: number;
  orders: number;
  salesRevenue: number;
  createdAt: string;
}

export interface TaxSettings {
  businessName: string;
  fiscalNumber: string;
  vatNumber: string;
  vatRate: number;
  pricesIncludeVat: boolean;
}

export interface StoreData {
  products: Product[];
  orders: Order[];
  collections: ProductCollection[];
  instagramPosts: InstagramPost[];
  tax: TaxSettings;
  language: "sq" | "en";
}

export const initialStore: StoreData = {
  products: [],
  orders: [],
  collections: [],
  instagramPosts: [],
  tax: {
    businessName: "",
    fiscalNumber: "",
    vatNumber: "",
    vatRate: 18,
    pricesIncludeVat: true,
  },
  language: "sq",
};

const databaseName = "atelier-store";
const databaseVersion = 1;

export function tr(language: StoreData["language"], sq: string, en: string): string {
  return language === "sq" ? sq : en;
}

export function isOrderStatus(value: string): value is OrderStatus {
  return value === "new" || value === "paid" || value === "sent" || value === "delivered" || value === "cancelled";
}

export function localDateTime(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

export async function loadStore(): Promise<StoreData> {
  const db = await openDatabase();
  try {
    const stored = await readRecord(db);
    if (stored === undefined) return initialStore;
    const migrated = normalizeStoreData(stored);
    if (!migrated) throw new Error("Saved store data is invalid. Restore a backup before continuing.");
    return migrated;
  } finally {
    db.close();
  }
}

export async function saveStore(data: StoreData): Promise<void> {
  const db = await openDatabase();
  try {
    await writeRecord(db, data);
  } finally {
    db.close();
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => request.result.createObjectStore("store");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open browser storage."));
    request.onblocked = () => reject(new Error("Browser storage is busy. Close other store tabs and try again."));
  });
}

function readRecord(db: IDBDatabase): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = db.transaction("store", "readonly").objectStore("store").get("current");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not read saved store data."));
  });
}

function writeRecord(db: IDBDatabase, data: StoreData): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("store", "readwrite");
    transaction.objectStore("store").put(data, "current");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Could not save store data."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Saving store data was cancelled."));
  });
}

export function isStoreData(value: unknown): value is StoreData {
  if (!isRecord(value)) return false;
  const record = value;
  const tax = record.tax;
  return Array.isArray(record.products)
    && Array.isArray(record.orders)
    && Array.isArray(record.collections)
    && Array.isArray(record.instagramPosts)
    && record.products.every(isProduct)
    && record.orders.every(isOrder)
    && record.collections.every(isProductCollection)
    && record.instagramPosts.every(isInstagramPost)
    && (record.language === "sq" || record.language === "en")
    && isRecord(tax)
    && isString(tax.businessName)
    && isString(tax.fiscalNumber)
    && isString(tax.vatNumber)
    && isNonNegativeNumber(tax.vatRate)
    && tax.vatRate <= 100
    && typeof tax.pricesIncludeVat === "boolean";
}

export function normalizeStoreData(value: unknown): StoreData | null {
  if (!isRecord(value)) return null;
  const withCollections = Array.isArray(value.collections) ? value : { ...value, collections: [] };
  const withInstagramPosts = Array.isArray(withCollections.instagramPosts)
    ? withCollections
    : { ...withCollections, instagramPosts: [] };
  return isStoreData(withInstagramPosts) ? withInstagramPosts : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isProductVariant(value: unknown): value is ProductVariant {
  return isRecord(value) && isString(value.id) && isString(value.color) && isString(value.size)
    && Number.isInteger(value.stock) && isNonNegativeNumber(value.stock);
}

function isProduct(value: unknown): value is Product {
  if (!isRecord(value) || !Array.isArray(value.variants)) return false;
  return isString(value.id) && isString(value.name) && isString(value.brand) && isString(value.sku)
    && isString(value.category) && isString(value.description)
    && isNonNegativeNumber(value.costPrice) && isNonNegativeNumber(value.retailPrice)
    && isNonNegativeNumber(value.wholesalePrice)
    && (value.image === null || isString(value.image))
    && value.variants.every(isProductVariant) && isString(value.createdAt);
}

function isOrderLine(value: unknown): value is OrderLine {
  return isRecord(value) && isString(value.productId) && isString(value.variantId)
    && isString(value.productName) && isString(value.sku) && isString(value.color)
    && isString(value.size) && Number.isInteger(value.quantity) && typeof value.quantity === "number"
    && value.quantity > 0 && isNonNegativeNumber(value.unitPrice);
}

function isOrder(value: unknown): value is Order {
  if (!isRecord(value) || !Array.isArray(value.lines)) return false;
  return isString(value.id) && isString(value.number) && isString(value.createdAt)
    && (value.channel === "retail" || value.channel === "wholesale")
    && isString(value.status) && isOrderStatus(value.status)
    && isString(value.customerName) && isString(value.customerPhone)
    && isString(value.customerEmail) && isString(value.customerFiscalNumber)
    && isString(value.customerAddress) && isString(value.notes)
    && value.lines.every(isOrderLine);
}

function isCollectionReminder(value: unknown): value is CollectionReminder {
  return isRecord(value) && isString(value.id) && isString(value.customerName) && isString(value.phone)
    && (value.whatsappOptIn === undefined || typeof value.whatsappOptIn === "boolean")
    && (value.viberOptIn === undefined || typeof value.viberOptIn === "boolean")
    && (value.consentCapturedAt === undefined || isString(value.consentCapturedAt))
    && (value.viberIntroConfirmed === undefined || typeof value.viberIntroConfirmed === "boolean")
    && (value.whatsappSentAt === undefined || isString(value.whatsappSentAt))
    && (value.whatsappMessageId === undefined || isString(value.whatsappMessageId))
    && (value.whatsappSendStatus === undefined || isSendStatus(value.whatsappSendStatus))
    && (value.viberSentAt === undefined || isString(value.viberSentAt))
    && (value.viberMessageId === undefined || isString(value.viberMessageId))
    && (value.viberSendStatus === undefined || isSendStatus(value.viberSendStatus))
    && (value.openedAt === undefined || isString(value.openedAt));
}

function isSendStatus(value: unknown): value is "accepted" | "failed" | "unknown" {
  return value === "accepted" || value === "failed" || value === "unknown";
}

function isProductCollection(value: unknown): value is ProductCollection {
  return isRecord(value) && isString(value.id) && isString(value.name) && isString(value.description)
    && isString(value.arrivalDate) && isString(value.createdAt)
    && Array.isArray(value.productIds) && value.productIds.every(isString)
    && Array.isArray(value.reminders) && value.reminders.every(isCollectionReminder);
}

function isInstagramPost(value: unknown): value is InstagramPost {
  return isRecord(value)
    && isString(value.id)
    && isString(value.caption)
    && isString(value.postUrl)
    && (value.mediaType === "post" || value.mediaType === "reel" || value.mediaType === "story")
    && (value.status === "planned" || value.status === "published")
    && isString(value.postDate)
    && Array.isArray(value.productIds) && value.productIds.every(isString)
    && isNonNegativeInteger(value.reach)
    && isNonNegativeInteger(value.likes)
    && isNonNegativeInteger(value.comments)
    && isNonNegativeInteger(value.shares)
    && isNonNegativeInteger(value.saves)
    && isNonNegativeInteger(value.profileVisits)
    && isNonNegativeInteger(value.orders)
    && isNonNegativeNumber(value.salesRevenue)
    && isString(value.createdAt);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && isNonNegativeNumber(value);
}

export function createId(): string {
  return crypto.randomUUID();
}

export function getStock(product: Product): number {
  return product.variants.reduce((total, variant) => total + variant.stock, 0);
}
