import { appConfig } from "@/app/config";

const tokenKey = "atelier-access-token";
const sessionEndedEvent = "atelier-session-ended";

export interface AuthSession {
  token: string;
  email: string;
  role: "Owner" | "Staff";
  expiresAt: string;
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem(tokenKey);
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${appConfig.apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Email or password is incorrect.");
    throw new Error(await response.text().catch(() => "") || `Sign in failed (${response.status}).`);
  }
  const session: AuthSession = await response.json();
  sessionStorage.setItem(tokenKey, session.token);
  return session;
}

export function signOut(): void {
  sessionStorage.removeItem(tokenKey);
  window.dispatchEvent(new Event(sessionEndedEvent));
}

export function clearExpiredSession(): void {
  signOut();
}

export { sessionEndedEvent };
