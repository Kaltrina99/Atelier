import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { appConfig } from "./config";
import { getAccessToken, sessionEndedEvent, signIn, signOut } from "@/shared/api/auth";
import { api } from "@/shared/api/client";
import { tr } from "@/features/store/model";
import { Dialog } from "@/features/store/StoreUI";

interface AuthValue {
  token: string | null;
  email: string;
  role: "Owner" | "Staff" | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(getAccessToken);
  const [email, setEmail] = useState(appConfig.apiBaseUrl ? "" : "Local mode");
  const [role, setRole] = useState<"Owner" | "Staff" | null>(appConfig.apiBaseUrl ? null : "Owner");

  useEffect(() => {
    const handleSessionEnded = () => {
      setToken(null);
      setEmail("");
      setRole(null);
    };
    window.addEventListener(sessionEndedEvent, handleSessionEnded);
    return () => window.removeEventListener(sessionEndedEvent, handleSessionEnded);
  }, []);

  useEffect(() => {
    if (!token || !appConfig.apiBaseUrl) return;
    let active = true;
    fetch(`${appConfig.apiBaseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Your session has expired. Please sign in again.");
        return response.json() as Promise<{ email: string; role: "Owner" | "Staff" }>;
      })
      .then((user) => {
        if (active) {
          setEmail(user.email);
          setRole(user.role);
        }
      })
      .catch(() => signOut());
    return () => { active = false; };
  }, [token]);

  const signInWithPassword = useCallback(async (username: string, password: string) => {
    const session = await signIn(username, password);
    setToken(session.token);
    setEmail(session.email);
    setRole(session.role);
  }, []);
  const value = useMemo(() => ({ token, email, role, signInWithPassword, signOut }), [token, email, role, signInWithPassword]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside AuthProvider");
  return auth;
}

export function SignInPage() {
  const { signInWithPassword } = useAuth();
  const [language, setLanguage] = useState<"sq" | "en">("sq");
  const t = (sq: string, en: string) => tr(language, sq, en);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signInWithPassword(email, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="auth-page"><section className="auth-card">
    <div className="auth-language language-switch"><button className={language === "sq" ? "language-active" : ""} onClick={() => setLanguage("sq")}>SQ</button><button className={language === "en" ? "language-active" : ""} onClick={() => setLanguage("en")}>EN</button></div>
    <div className="brand-symbol">A</div><div className="eyebrow">{t("MENAXHIMI I BUTIKUT", "BOUTIQUE MANAGEMENT")}</div><h1>{t("Mirë se u kthyet.", "Welcome back.")}</h1><p>{t("Hyni në llogarinë e sigurt të dyqanit tuaj.", "Sign in securely to access your store.")}</p>
    <form className="store-form" onSubmit={(event) => void submit(event)}>
      <label className="control"><span>{t("Email", "Email")}</span><input autoComplete="username" required type="email" className="input" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="control"><span>{t("Fjalëkalimi", "Password")}</span><input autoComplete="current-password" required type="password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-dark" disabled={busy}>{busy ? t("Duke hyrë…", "Signing in…") : t("Hyr", "Sign in")}</button>
    </form>
  </section></main>;
}

export function StaffManager({ language }: { language: "sq" | "en" }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState("");
  const t = (sq: string, en: string) => tr(language, sq, en);

  const createStaff = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback("");
    try {
      await api.post<string>("/api/auth/staff", { email, password });
      setFeedback(t("Llogaria u krijua. Ndajeni fjalëkalimin në mënyrë të sigurt.", "Account created. Share the password securely."));
      setEmail("");
      setPassword("");
    } catch (reason) {
      setFeedback(reason instanceof Error ? reason.message : t("Llogaria nuk u krijua.", "Account could not be created."));
    }
  };

  return <>
    <button className="button button-light button-signout" onClick={() => { setOpen(true); setFeedback(""); }}>{t("Shto staf", "Add staff")}</button>
    {open && <Dialog title={t("Llogari për stafin", "Staff account")} onClose={() => setOpen(false)}>
      <form className="store-form" onSubmit={(event) => void createStaff(event)}>
        <p className="settings-footnote">{t("Llogaria e re do të ketë qasje në të dhënat e dyqanit. Përdorni fjalëkalim të fortë prej së paku 12 karakteresh.", "The new account will access this store's data. Use a strong password of at least 12 characters.")}</p>
        <label className="control"><span>{t("Email i stafit", "Staff email")}</span><input className="input" required type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="control"><span>{t("Fjalëkalim fillestar", "Temporary password")}</span><input className="input" required minLength={12} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {feedback && <p className={feedback.includes("could not") || feedback.includes("nuk u") ? "form-error" : "success-message"} role="status">{feedback}</p>}
        <div className="dialog-actions"><button type="button" className="button button-light" onClick={() => setOpen(false)}>{t("Mbyll", "Close")}</button><button className="button button-dark">{t("Krijo llogari", "Create account")}</button></div>
      </form>
    </Dialog>}
  </>;
}
