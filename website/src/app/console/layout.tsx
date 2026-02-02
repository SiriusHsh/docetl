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
  Cpu,
  Settings,
  Shield,
  ChevronDown,
} from "lucide-react";

import {
  clearAuthSession,
  getAuthExpiresAt,
  getAuthToken,
  getStoredAuthUser,
} from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon?: ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  children: NavItem[];
};

const DATA_GENERATION_CHILDREN: NavItem[] = [
  { label: "数据蒸馏", href: "/console/data-generation/distillation" },
  { label: "数据合成", href: "/console/data-generation/synthesis" },
  { label: "数据泛化", href: "/console/data-generation/generalization" },
  { label: "数据转化", href: "/console/data-generation/transformation" },
  { label: "人工创建", href: "/console/data-generation/manual" },
];

const MAIN_NAV: Array<NavItem | NavGroup> = [
  { label: "看板", href: "/console/dashboard", icon: LayoutDashboard },
  { label: "运行记录", href: "/console/runs", icon: ListChecks },
  {
    label: "数据生成",
    icon: Play,
    children: DATA_GENERATION_CHILDREN,
  },
  { label: "部署", href: "/console/deployments", icon: Rocket },
  { label: "数据货架", href: "/console/data-center", icon: Database },
  { label: "模型资源池", href: "/console/models", icon: Cpu },
];

export default function ConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const activePath = useMemo(() => pathname || "", [pathname]);
  const dataGenerationActive = useMemo(
    () =>
      activePath.startsWith("/console/data-generation") ||
      activePath.startsWith("/console/execute"),
    [activePath]
  );
  const [dataGenerationOpen, setDataGenerationOpen] = useState(
    dataGenerationActive
  );

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
    if (dataGenerationActive) {
      setDataGenerationOpen(true);
    }
  }, [dataGenerationActive]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const portals = Array.from(
      document.querySelectorAll<HTMLElement>("[data-radix-portal]")
    );
    portals.forEach((portal) => {
      const hasDialog = portal.querySelector(
        '[role="dialog"],[role="alertdialog"]'
      );
      if (!hasDialog) {
        portal.remove();
      }
    });
  }, [activePath]);
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
              if ("children" in item) {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="space-y-1">
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                        dataGenerationActive
                          ? "bg-slate-200 text-slate-900"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      )}
                      onClick={() =>
                        setDataGenerationOpen((prev) => !prev)
                      }
                      aria-expanded={dataGenerationOpen}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform",
                          dataGenerationOpen ? "rotate-0" : "-rotate-90"
                        )}
                      />
                    </button>
                    {dataGenerationOpen ? (
                      <div className="ml-7 space-y-1 border-l border-slate-200 pl-3">
                        {item.children.map((child) => {
                          const isChildActive =
                            activePath === child.href ||
                            (child.href === "/console/data-generation" &&
                              activePath.startsWith("/console/execute"));
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={cn(
                                "block rounded-md px-2 py-1.5 text-sm transition",
                                isChildActive
                                  ? "bg-slate-200 text-slate-900"
                                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                              )}
                            >
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              }

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
                  {Icon ? <Icon className="h-4 w-4" /> : null}
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
            <div className="flex-1">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
