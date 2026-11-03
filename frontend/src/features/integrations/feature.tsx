import { lazy } from "react";
import type { FeatureDefinition } from "@/app/features";

export default {
  path: "integrations",
  label: "Integrations",
  order: 90,
  Component: lazy(() => import("./IntegrationsPage")),
} satisfies FeatureDefinition;
