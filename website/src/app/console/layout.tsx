"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import type { ComponentType, ReactNode } from "react";
import {
  LayoutDashboard,
  Play,
  Rocket,
  Database,
  Settings,
} from "lucide-react";

import { clearAuthSession, getAuthExpiresAt, getAuthToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
};

const MAIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "/console/dashboard", icon: LayoutDashboard },
  { label: "Execute", href: "/console/execute", icon: Play },
  { label: "Deployments", href: "/console/deployments", icon: Rocket },
  { label: "Data Center", href: "/console/data-center", icon: Database },
];

const SECONDARY_NAV: NavItem[] = [
  { label: "Settings", href: "/console/settings", icon: Settings },
];

export default function ConsoleLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const token = getAuthToken();
    const expiresAt = getAuthExpiresAt();
    const now = Math.floor(Date.now() / 1000);
    if (!token || (expiresAt !== null && expiresAt <= now)) {
      clearAuthSession();
      router.replace("/login");
    }
  }, [router]);

  const activePath = useMemo(() => pathname || "", [pathname]);

  return (
    <div className="min-h-screen bg-[#0f1116] text-slate-100">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-white/5 bg-[#11131a]">
          <div className="flex items-center gap-3 px-5 py-5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-sky-300 via-cyan-200 to-emerald-200 text-[#0f1116] flex items-center justify-center font-bold">
              D
            </div>
            <div className="text-lg font-semibold tracking-wide">DocETL</div>
          </div>
          <nav className="px-3 py-2">
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
                      ? "bg-white/10 text-white"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="px-3 pb-4">
            <div className="my-3 h-px bg-white/5" />
            {SECONDARY_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = activePath.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
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
          <div className="min-h-screen bg-[#0f1116]">{children}</div>
        </main>
      </div>
    </div>
  );
}
