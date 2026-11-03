import { z } from "zod";
import type { EntityBase } from "@/shared/api/types";

/** Mirrors ProductResponse on the backend */
export interface Product extends EntityBase {
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
}

/** Mirrors ProductRequest + ProductRequestValidator on the backend */
export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  description: z.string().max(2000).nullable(),
  price: z.number({ error: "Enter a price" }).min(0, "Price can't be negative"),
  isActive: z.boolean(),
});

export type ProductInput = z.infer<typeof productSchema>;
