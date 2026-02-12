"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, User } from "lucide-react";

import { clearAuthSession, getAuthToken, type StoredAuthUser } from "@/lib/auth";
import { backendFetch } from "@/lib/backendFetch";
import { getBackendUrl } from "@/lib/api-config";
import * as localStorageKeys from "@/app/localStorageKeys";
import { readNamespace, writeNamespace } from "@/lib/namespace";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ScenarioOption = {
  namespace: string;
  display_name: string;
  is_active?: boolean;
};

export default function SettingsPage() {
  const router = useRouter();
  const backendUrl = getBackendUrl();
  const [user, setUser] = useState<StoredAuthUser | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([]);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [namespace, setNamespace] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(localStorageKeys.AUTH_USER_KEY);
    if (!raw) return;
    try {
      setUser(JSON.parse(raw));
    } catch {
      setUser(null);
    }
    setNamespace(readNamespace());
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

  useEffect(() => {
    const loadScenarios = async () => {
      if (!user) return;
      setScenarioLoading(true);
      try {
        const isAdmin = user.platform_role === "platform_admin";
        const response = await backendFetch(
          isAdmin
            ? `${backendUrl}/scenarios?include_inactive=true&limit=500`
            : `${backendUrl}/scenarios/mine`
        );
        if (!response.ok) return;
        const data = (await response.json()) as ScenarioOption[];
        const base = isAdmin
          ? [
              {
                namespace: "__all__",
                display_name: "全部业务场景",
                is_active: true,
              },
              ...data,
            ]
          : data;
        setScenarios(base);
      } finally {
        setScenarioLoading(false);
      }
    };
    void loadScenarios();
  }, [backendUrl, user]);

  useEffect(() => {
    if (!scenarios.length) return;
    if (!namespace || !scenarios.some((item) => item.namespace === namespace)) {
      const fallback = scenarios[0]?.namespace ?? null;
      setNamespace(fallback);
      writeNamespace(fallback);
    }
  }, [namespace, scenarios]);

  const handleScenarioChange = (nextNamespace: string) => {
    if (nextNamespace === namespace) return;
    setNamespace(nextNamespace);
    Object.values(localStorageKeys).forEach((key) => {
      if (typeof key !== "string") return;
      if (key.startsWith("docetl_auth_")) return;
      window.localStorage.removeItem(key);
    });
    writeNamespace(nextNamespace);
    window.location.reload();
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

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-slate-600">业务场景</div>
        <p className="mt-1 text-sm text-slate-500">
          切换后将刷新全平台数据视图。
        </p>
        <div className="mt-4 space-y-2 max-w-xl">
          <Label className="text-xs text-slate-500">当前业务场景</Label>
          {scenarioLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              场景加载中...
            </div>
          ) : (
            <Select
              value={namespace ?? undefined}
              onValueChange={handleScenarioChange}
            >
              <SelectTrigger className="bg-white border-slate-200 text-slate-700">
                <SelectValue placeholder="请选择业务场景" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 text-slate-900">
                {scenarios.map((item) => (
                  <SelectItem key={item.namespace} value={item.namespace}>
                    {item.display_name}
                    {item.is_active === false ? "（停用）" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </div>
  );
}
