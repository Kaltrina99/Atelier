import { createCrud } from "@/shared/api/crud";
import type { Product, ProductInput } from "./types";

export const productsApi = createCrud<Product, ProductInput>("products");
