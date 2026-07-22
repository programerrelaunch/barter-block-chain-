const API_BASE = import.meta.env.VITE_API_URL ?? "";

export type Session = {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
    exchangeId: string;
    businessName: string;
    balanceCents?: number;
  };
};

export function getSession(): Session | null {
  const raw = localStorage.getItem("bc_session");
  return raw ? JSON.parse(raw) : null;
}

export function setSession(session: Session | null) {
  if (!session) localStorage.removeItem("bc_session");
  else localStorage.setItem("bc_session", JSON.stringify(session));
}

export async function api<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const token = options.token ?? getSession()?.token;
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.error ?? `Request failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
  }
  return data as T;
}

export function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
