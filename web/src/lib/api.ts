const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const REFRESH_KEY = 'refresh_token';

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface User {
  id: number;
  email: string;
}

interface Tokens {
  access_token: string;
  refresh_token: string;
}

export function hasRefreshToken(): boolean {
  return localStorage.getItem(REFRESH_KEY) !== null;
}

function setSession(t: Tokens): void {
  accessToken = t.access_token;
  localStorage.setItem(REFRESH_KEY, t.refresh_token);
}

export function clearSession(): void {
  accessToken = null;
  localStorage.removeItem(REFRESH_KEY);
}

// refreshAccess exchanges the stored refresh token for a new access token.
// Single-flight: concurrent callers share one in-flight request.
export function refreshAccess(): Promise<string | null> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function doRefresh(): Promise<string | null> {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return null;
  const res = await fetch(`${API_URL}/api/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    clearSession();
    return null;
  }
  const data = (await res.json()) as { access_token: string };
  accessToken = data.access_token;
  return accessToken;
}

interface RequestOpts {
  method?: string;
  body?: unknown;
}

async function request<T>(
  path: string,
  opts: RequestOpts = {},
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && retry && hasRefreshToken()) {
    const token = await refreshAccess();
    if (token) return request<T>(path, opts, false);
  }

  if (!res.ok) {
    throw new ApiError(res.status, await errorMessage(res));
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) return data.error;
  } catch {
    // no JSON body
  }
  return `request failed (${res.status})`;
}

export async function signup(email: string, password: string): Promise<void> {
  setSession(
    await request<Tokens>('/api/signup', {
      method: 'POST',
      body: { email, password },
    }),
  );
}

export async function login(email: string, password: string): Promise<void> {
  setSession(
    await request<Tokens>('/api/login', {
      method: 'POST',
      body: { email, password },
    }),
  );
}

export async function logout(): Promise<void> {
  const refresh = localStorage.getItem(REFRESH_KEY);
  try {
    await request<null>('/api/logout', {
      method: 'POST',
      body: { refresh_token: refresh },
    });
  } finally {
    clearSession();
  }
}

export function me(): Promise<User> {
  return request<User>('/api/me');
}

export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  role: string;
  content: string;
  created_at: string;
}

export function listConversations(): Promise<Conversation[]> {
  return request<Conversation[]>('/api/conversations');
}

export function createConversation(): Promise<Conversation> {
  return request<Conversation>('/api/conversations', { method: 'POST' });
}

export async function renameConversation(
  id: number,
  title: string,
): Promise<void> {
  await request<null>(`/api/conversations/${id}`, {
    method: 'PATCH',
    body: { title },
  });
}

export async function deleteConversation(id: number): Promise<void> {
  await request<null>(`/api/conversations/${id}`, { method: 'DELETE' });
}

export function getMessages(id: number): Promise<Message[]> {
  return request<Message[]>(`/api/conversations/${id}/messages`);
}
