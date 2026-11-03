import type { ComponentType, LazyExoticComponent } from "react";

/** What every features/<name>/feature.tsx must export as default. */
export interface FeatureDefinition {
  /** URL segment, e.g. "products" → /products */
  path: string;
  /** Label in the sidebar */
  label: string;
  /** Sort order in the sidebar (lower = higher up) */
  order?: number;
  /** Hide from the sidebar but keep the route */
  hidden?: boolean;
  /** The page (use React.lazy so each feature is its own bundle) */
  Component: ComponentType | LazyExoticComponent<ComponentType>;
}

// Auto-discovery: drop a folder with a feature.tsx into src/features and it appears.
const modules = import.meta.glob<{ default: FeatureDefinition }>("../features/*/feature.tsx", {
  eager: true,
});

export const features: FeatureDefinition[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.label.localeCompare(b.label));
