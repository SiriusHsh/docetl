"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";

import { clearAuthSession, getAuthToken, type StoredAuthUser } from "@/lib/auth";
import { backendFetch } from "@/lib/backendFetch";
import { getBackendUrl } from "@/lib/api-config";
import * as localStorageKeys from "@/app/localStorageKeys";

export default function SettingsPage() {
  const router = useRouter();
  const backendUrl = getBackendUrl();
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
        <User className="h-6 w-6 text-slate-600" />
        <h1 className="text-2xl font-semibold text-slate-900">设置</h1>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        管理个人信息与会话。
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-slate-600">当前用户</div>
        <div className="mt-2 text-lg font-medium text-slate-900">
          {user?.username || "未知用户"}
        </div>
        {user?.email ? (
          <div className="mt-1 text-sm text-slate-500">{user.email}</div>
        ) : null}
        <button
          type="button"
          onClick={handleLogout}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </div>
    </div>
  );
}
