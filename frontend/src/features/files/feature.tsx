import { lazy } from "react";
import type { FeatureDefinition } from "@/app/features";

export default {
  path: "files",
  label: "Files",
  order: 80,
  Component: lazy(() => import("./FilesPage")),
} satisfies FeatureDefinition;
