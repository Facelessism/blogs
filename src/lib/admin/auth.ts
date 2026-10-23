const SESSION_KEY = "blogs-admin-session-v1";

const API_URL = (import.meta.env.PUBLIC_ADMIN_API_URL as string | undefined)
  ?.replace(/\/+$/, "");

export interface AdminSession {
  token: string;
  username: string;
  expiresIn: number;
}

function getApiUrl(): string {
  if (!API_URL) {
    throw new Error("Admin API URL is not configured.");
  }

  return API_URL;
}

export function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export async function loginWithPat(pat: string): Promise<AdminSession> {
  const response = await fetch(`${getApiUrl()}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    credentials: "omit",
    body: JSON.stringify({ pat })
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || "Authentication failed.");
  }

  if (
    typeof result.token !== "string" ||
    result.username !== "Facelessism"
  ) {
    throw new Error("The server returned an invalid admin session.");
  }

  sessionStorage.setItem(SESSION_KEY, result.token);

  return result as AdminSession;
}

export async function verifyAdminSession(): Promise<boolean> {
  const token = getSessionToken();

  if (!token) return false;

  try {
    const response = await fetch(`${getApiUrl()}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      credentials: "omit"
    });

    if (!response.ok) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }

    const result = await response.json();

    if (result.authenticated !== true || result.username !== "Facelessism") {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function logoutAdmin(): void {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.replace("/admin/login/");
}
