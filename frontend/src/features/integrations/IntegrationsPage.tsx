import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/shared/api/client";

interface IntegrationStatus {
  storage: string;
  email: string;
  region: string | null;
  credentials: string;
}

export default function IntegrationsPage() {
  const { data } = useQuery({ queryKey: ["integrations"], queryFn: () => api.get<IntegrationStatus>("/api/integrations") });
  const [to, setTo] = useState("");
  const test = useMutation({ mutationFn: () => api.post<string>("/api/integrations/test-email", { to }) });

  const rows: [string, string | undefined | null, boolean][] = [
    ["File storage", data?.storage, !!data?.storage.startsWith("Amazon")],
    ["Email", data?.email, !!data?.email.startsWith("Amazon")],
    ["AWS region", data?.region ?? "Not set", !!data?.region],
    ["Credentials", data?.credentials, true],
  ];

  return (
    <div className="page narrow">
      <header className="page-head">
        <h1>Integrations</h1>
      </header>
      <p className="muted">
        Fill in the <code>Aws</code> section of the API configuration and restart. Anything not configured falls back
        to a local alternative so the app keeps working.
      </p>

      <dl className="status-list">
        {rows.map(([label, value, live]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd><span className={`dot ${live ? "on" : ""}`} aria-hidden />{value ?? "…"}</dd>
          </div>
        ))}
      </dl>

      <h2>Send a test email</h2>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); test.mutate(); }}>
        <input className="input" type="email" required placeholder="you@company.ch" value={to} onChange={(e) => setTo(e.target.value)} />
        <button className="btn btn-primary" disabled={test.isPending}>{test.isPending ? "Sending…" : "Send test email"}</button>
      </form>
      {test.isSuccess && <p className="banner-ok">{test.data}</p>}
      {test.isError && <p className="banner-error">{test.error.message}</p>}
    </div>
  );
}
