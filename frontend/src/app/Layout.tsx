import { Suspense } from "react";
import { NavLink, Outlet } from "react-router";
import { appConfig } from "./config";
import { features } from "./features";

export function Layout() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          {appConfig.name}
        </div>
        <nav>
          {features
            .filter((f) => !f.hidden)
            .map((f) => (
              <NavLink key={f.path} to={`/${f.path}`} className="nav-link">
                {f.label}
              </NavLink>
            ))}
        </nav>
      </aside>
      <main className="content">
        <Suspense fallback={<p className="empty">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
