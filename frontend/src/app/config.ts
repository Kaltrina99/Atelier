/** App-wide settings. Change these per project. */
export const appConfig = {
  name: "Atelier",
  apiBaseUrl: (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, ""),
};
