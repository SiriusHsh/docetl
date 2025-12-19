"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
import { clearAuthSession, getAuthToken, type StoredAuthUser } from "@/lib/auth";
import { getBackendUrl } from "@/lib/api-config";
import * as localStorageKeys from "@/app/localStorageKeys";

export default function SettingsPage() {
  const router = useRouter();
  const backendUrl = useMemo(() => getBackendUrl(), []);
  const [user, setUser] = useState<StoredAuthUser | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(localStorageKeys.AUTH_USER_KEY);
    if (!raw) return;
    try {
      setUser(JSON.parse(raw));
    } catch {
      setUser(null);
    }
  }, []);

  const handleLogout = async () => {
    try {
      const token = getAuthToken();
      if (token) {
        await backendFetch(`${backendUrl}/auth/logout`, { method: "POST" });
      }
    } finally {
      clearAuthSession();
      router.replace("/login");
    }
  };

  return (
    <div className="px-6 py-6">
      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-slate-200" />
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Manage your profile and session.
      </p>

      <div className="mt-6 rounded-2xl border border-white/5 bg-white/5 p-5">
        <div className="text-sm text-slate-300">Current User</div>
        <div className="mt-2 text-lg font-medium text-white">
          {user?.username || "Unknown user"}
        </div>
        {user?.email ? (
          <div className="mt-1 text-sm text-slate-400">{user.email}</div>
        ) : null}
        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:border-white/20 hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
