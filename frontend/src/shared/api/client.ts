import { appConfig } from "@/app/config";
import { clearExpiredSession, getAccessToken } from "./auth";

/** Thrown for any non-2xx response. Understands ASP.NET problem details. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Field-level validation errors, keys camelCased to match the form fields */
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

const camel = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(appConfig.apiBaseUrl + url, {
    method,
    headers: {
      ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 401) clearExpiredSession();
    const problem = await res.json().catch(() => ({}));
    const fieldErrors = Object.fromEntries(
      Object.entries((problem.errors ?? {}) as Record<string, string[]>).map(([k, v]) => [camel(k), v[0]]),
    );
    throw new ApiError(res.status, problem.title ?? `Request failed (${res.status})`, fieldErrors);
  }

  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body: unknown) => request<T>("POST", url, body),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  delete: (url: string) => request<void>("DELETE", url),
  /** multipart/form-data upload, field name "file" */
  upload: <T>(url: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<T>("POST", url, form);
  },
  /** Absolute URL for links (downloads etc.) */
  url: (path: string) => appConfig.apiBaseUrl + path,
};
