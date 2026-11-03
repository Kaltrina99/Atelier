import { lazy } from "react";
import type { FeatureDefinition } from "@/app/features";

export default {
  path: "products",
  label: "Products",
  order: 10,
  Component: lazy(() => import("./ProductsPage")),
} satisfies FeatureDefinition;
