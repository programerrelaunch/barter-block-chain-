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
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    localStorage.removeItem("bc_session");
    return null;
  }
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
  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  let data: Record<string, unknown> = {};
  if (raw) {
    if (!contentType.includes("application/json") && raw.trimStart().startsWith("<")) {
      throw new Error(`API returned HTML instead of JSON (${res.status})`);
    }
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      throw new Error(`API returned invalid JSON (${res.status})`);
    }
  }
  if (!res.ok) {
    const detail = data.error ?? `Request failed (${res.status})`;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
  }
  return data as T;
}

export function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
