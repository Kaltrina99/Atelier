import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { appConfig } from "@/app/config";
import { api, ApiError } from "@/shared/api/client";
import { initialStore, loadStore, normalizeStoreData, saveStore, type StoreData } from "./model";

interface StoreContextValue {
  data: StoreData;
  warning: string | null;
  loading: boolean;
  commit: (next: StoreData | ((current: StoreData) => StoreData)) => Promise<boolean>;
  refresh: () => Promise<void>;
}

interface StoreResponse {
  data: string;
  version: string;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(initialStore);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(data);
  const version = useRef("");
  const writeQueue = useRef(Promise.resolve());

  const refresh = useCallback(async () => {
    try {
      if (!appConfig.apiBaseUrl) {
        const stored = await loadStore();
        latest.current = stored;
        setData(stored);
        setWarning(null);
        return;
      }
      const response = await api.get<StoreResponse>("/api/store/");
      const parsed: unknown = JSON.parse(response.data);
      const stored = parsed === null ? initialStore : normalizeStoreData(parsed);
      if (!stored) throw new Error("Saved store data is invalid. Restore a backup before continuing.");
      latest.current = stored;
      version.current = response.version;
      setData(stored);
      setWarning(null);
    } catch (reason) {
      setWarning(reason instanceof Error ? reason.message : "Could not load shared store data.");
      throw reason;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh().catch(() => undefined); }, [refresh]);

  const commit = useCallback((next: StoreData | ((current: StoreData) => StoreData)): Promise<boolean> => {
    const result = writeQueue.current.then(async () => {
      try {
        const updated = typeof next === "function" ? next(latest.current) : next;
        if (!appConfig.apiBaseUrl) {
          await saveStore(updated);
          latest.current = updated;
          setData(updated);
          setWarning(null);
          return true;
        }
        const response = await api.put<StoreResponse>("/api/store/", {
          data: JSON.stringify(updated),
          version: version.current,
        });
        version.current = response.version;
        latest.current = updated;
        setData(updated);
        setWarning(null);
        return true;
      } catch (reason) {
        const message = reason instanceof ApiError && reason.status === 409
          ? "Store data changed in another session. Reload the page before making more changes."
          : reason instanceof Error ? reason.message : "Could not save your changes.";
        setWarning(message);
        return false;
      }
    });
    writeQueue.current = result.then(() => undefined);
    return result;
  }, []);

  const value = useMemo(() => ({ data, warning, loading, commit, refresh }), [data, warning, loading, commit, refresh]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}
