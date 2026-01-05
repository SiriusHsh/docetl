"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  LayoutDashboard,
  ListChecks,
  Play,
  Rocket,
  Database,
  Settings,
  Shield,
} from "lucide-react";

import {
  clearAuthSession,
  getAuthExpiresAt,
  getAuthToken,
  getStoredAuthUser,
} from "@/lib/auth";
import { backendFetch } from "@/lib/backendFetch";
import { getBackendUrl } from "@/lib/api-config";
import {
  readNamespace,
  subscribeToNamespaceChanges,
  writeNamespace,
} from "@/lib/namespace";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

type MembershipRecord = {
  namespace: string;
  role: string;
  created_at: number;
  updated_at: number;
};

const MAIN_NAV: NavItem[] = [
  { label: "仪表盘", href: "/console/dashboard", icon: LayoutDashboard },
  { label: "运行记录", href: "/console/runs", icon: ListChecks },
  { label: "执行", href: "/console/execute", icon: Play },
  { label: "部署", href: "/console/deployments", icon: Rocket },
  { label: "数据中心", href: "/console/data-center", icon: Database },
];

export default function ConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const backendUrl = useMemo(() => getBackendUrl(), []);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [activeNamespace, setActiveNamespace] = useState<string | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState("");

  useEffect(() => {
    const token = getAuthToken();
    const expiresAt = getAuthExpiresAt();
    const now = Math.floor(Date.now() / 1000);
    if (!token || (expiresAt !== null && expiresAt <= now)) {
      clearAuthSession();
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    const user = getStoredAuthUser();
    setIsAdmin(user?.platform_role === "platform_admin");
  }, []);

  useEffect(() => {
    const stored = readNamespace();
    if (stored) {
      setActiveNamespace(stored);
      setSelectedNamespace(stored);
    }
    return subscribeToNamespaceChanges((next) => {
      setActiveNamespace(next);
      setSelectedNamespace(next ?? "");
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadMemberships = async () => {
      const token = getAuthToken();
      if (!token) return;
      setLoadingMemberships(true);
      setMembershipError(null);
      try {
        const response = await backendFetch(`${backendUrl}/auth/me`);
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(detail || "加载权限失败");
        }
        const data = (await response.json()) as {
          memberships?: MembershipRecord[];
        };
        if (cancelled) return;
        const list = data.memberships || [];
        setMemberships(list);
        if (list.length > 0 && (!activeNamespace || !list.some((m) => m.namespace === activeNamespace))) {
          setSelectedNamespace(list[0].namespace);
        }
      } catch (error) {
        if (!cancelled) {
          setMembershipError(
            error instanceof Error ? error.message : "加载权限失败"
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingMemberships(false);
        }
      }
    };
    void loadMemberships();
    return () => {
      cancelled = true;
    };
  }, [activeNamespace, backendUrl]);

  const activePath = useMemo(() => pathname || "", [pathname]);
  const secondaryNav = useMemo<NavItem[]>(() => {
    const items: NavItem[] = [];
    if (isAdmin) {
      items.push({ label: "管理员", href: "/console/admin", icon: Shield });
    }
    items.push({ label: "设置", href: "/console/settings", icon: Settings });
    return items;
  }, [isAdmin]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-slate-200 bg-white flex flex-col h-screen">
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-sky-300 via-cyan-200 to-emerald-200 text-slate-900 flex items-center justify-center font-bold">
              D
            </div>
            <div className="text-lg font-semibold tracking-wide">
              Zhongjing Dataflow
            </div>
          </div>
          <nav className="px-3 py-2 flex-1 min-h-0 overflow-y-auto">
            {MAIN_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = activePath.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                    isActive
                      ? "bg-slate-200 text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="px-3 pb-4 mt-auto">
            <div className="my-3 h-px bg-slate-200" />
            {secondaryNav.map((item) => {
              const Icon = item.icon;
              const isActive = activePath.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                    isActive
                      ? "bg-slate-200 text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </aside>
        <main className="flex-1">
          <div className="min-h-screen bg-slate-50 flex flex-col">
            <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <div className="text-sm text-slate-600">
                  工作区：{" "}
                  <span className="text-slate-900">
                    {activeNamespace || "-"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {membershipError ? (
                    <span className="text-xs text-red-400">{membershipError}</span>
                  ) : memberships.length === 0 ? (
                    <span className="text-xs text-slate-500">
                      暂无可用工作区
                    </span>
                  ) : (
                    <>
                      <Select
                        value={selectedNamespace || ""}
                        onValueChange={setSelectedNamespace}
                        disabled={loadingMemberships}
                      >
                        <SelectTrigger className="h-8 w-[220px] bg-white border-slate-200 text-slate-700">
                          <SelectValue placeholder="选择工作区" />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-slate-200 text-slate-900">
                          {memberships.map((membership) => (
                            <SelectItem
                              key={membership.namespace}
                              value={membership.namespace}
                            >
                              {membership.namespace} ({membership.role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-slate-300 text-slate-700 hover:bg-slate-100"
                        disabled={
                          loadingMemberships ||
                          !selectedNamespace ||
                          selectedNamespace === activeNamespace
                        }
                        onClick={() => {
                          if (!selectedNamespace) return;
                          writeNamespace(selectedNamespace);
                          setActiveNamespace(selectedNamespace);
                        }}
                      >
                        应用
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-1">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
