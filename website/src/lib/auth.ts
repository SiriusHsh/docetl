import {
  AUTH_EXPIRES_AT_KEY,
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
} from "@/app/localStorageKeys";

export type StoredAuthUser = {
  id: string;
  username: string;
  email?: string | null;
  platform_role?: string;
};

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getAuthToken(): string | null {
  if (!canUseLocalStorage()) return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getAuthExpiresAt(): number | null {
  if (!canUseLocalStorage()) return null;
  const raw = window.localStorage.getItem(AUTH_EXPIRES_AT_KEY);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function setAuthSession(params: {
  token: string;
  expiresAt: number;
  user?: StoredAuthUser;
}) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(AUTH_TOKEN_KEY, params.token);
  window.localStorage.setItem(AUTH_EXPIRES_AT_KEY, String(params.expiresAt));
  if (params.user) {
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(params.user));
  }
}

export function clearAuthSession() {
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_EXPIRES_AT_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
}

export function getStoredAuthUser(): StoredAuthUser | null {
  if (!canUseLocalStorage()) return null;
  const raw = window.localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredAuthUser;
  } catch {
    return null;
  }
}

