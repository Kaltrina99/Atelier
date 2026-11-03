import { ResourcePage, type Column } from "@/shared/ui/ResourcePage";
import { productsApi } from "./api";
import { ProductForm } from "./ProductForm";
import type { Product } from "./types";

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "CHF" });

const columns: Column<Product>[] = [
  { header: "Name", cell: (p) => <strong>{p.name}</strong> },
  { header: "Description", cell: (p) => <span className="muted">{p.description ?? "—"}</span> },
  { header: "Price", cell: (p) => money.format(p.price), align: "end" },
  { header: "Status", cell: (p) => <span className={`pill ${p.isActive ? "on" : ""}`}>{p.isActive ? "Active" : "Inactive"}</span> },
];

export default function ProductsPage() {
  return <ResourcePage title="Products" singular="Product" api={productsApi} columns={columns} Form={ProductForm} />;
}
