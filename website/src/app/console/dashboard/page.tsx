"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  Layers,
  PlayCircle,
  Timer,
} from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
import { getBackendUrl } from "@/lib/api-config";
import * as localStorageKeys from "@/app/localStorageKeys";
import { cn } from "@/lib/utils";

type RunSummary = {
  total: number;
  running: number;
  failed: number;
  completed: number;
  cancelled: number;
  last_run_at: number | null;
};

type StatCardProps = {
  label: string;
  value: number | null;
  helper?: string;
  icon: ComponentType<{ className?: string }>;
  highlight?: boolean;
};

function StatCard({ label, value, helper, icon: Icon, highlight }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/5 bg-gradient-to-br from-white/5 to-transparent p-4 shadow-inner",
        highlight && "border-emerald-400/40 shadow-emerald-500/10"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-300">{label}</span>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="mt-2 text-3xl font-semibold text-white">
        {value ?? "--"}
      </div>
      {helper ? <div className="mt-1 text-xs text-slate-400">{helper}</div> : null}
    </div>
  );
}

export default function DashboardPage() {
  const backendUrl = useMemo(() => getBackendUrl(), []);
  const [namespace, setNamespace] = useState<string | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [pipelineCount, setPipelineCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(localStorageKeys.NAMESPACE_KEY);
    if (!stored) return;
    try {
      setNamespace(JSON.parse(stored));
    } catch {
      setNamespace(stored);
    }
  }, []);

  useEffect(() => {
    if (!namespace) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [summaryResponse, pipelinesResponse] = await Promise.all([
          backendFetch(
            `${backendUrl}/runs/summary?namespace=${encodeURIComponent(namespace)}`
          ),
          backendFetch(
            `${backendUrl}/pipelines?namespace=${encodeURIComponent(namespace)}`
          ),
        ]);

        if (cancelled) return;

        if (summaryResponse.ok) {
          const data = (await summaryResponse.json()) as RunSummary;
          setSummary(data);
        } else {
          setError("Unable to load run summary");
        }

        if (pipelinesResponse.ok) {
          const pipelines = (await pipelinesResponse.json()) as Array<unknown>;
          setPipelineCount(pipelines.length);
        } else {
          setError((prev) => prev || "Unable to load pipelines");
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load dashboard data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [backendUrl, namespace]);

  const lastRunText = summary?.last_run_at
    ? new Date(summary.last_run_at * 1000).toLocaleString()
    : "No runs yet";

  return (
    <div className="px-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400">
          {namespace ? `Active namespace: ${namespace}` : "Set a namespace in Execute to continue"}
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pipelines"
          value={pipelineCount}
          helper="Registered pipelines"
          icon={Layers}
        />
        <StatCard
          label="Running"
          value={summary?.running ?? null}
          helper={loading ? "Loading..." : "Active runs"}
          icon={Activity}
          highlight
        />
        <StatCard
          label="Failed"
          value={summary?.failed ?? null}
          helper="Runs needing attention"
          icon={AlertTriangle}
        />
        <StatCard
          label="Total Runs"
          value={summary?.total ?? null}
          helper="All-time executions"
          icon={PlayCircle}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-white/5 bg-white/5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-300">Last Run</div>
            <div className="mt-1 text-lg font-medium text-white">{lastRunText}</div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            <Timer className="h-3 w-3" />
            <span>{loading ? "Syncing" : "Synced"}</span>
          </div>
        </div>
        {error ? (
          <div className="mt-3 text-sm text-rose-300">{error}</div>
        ) : null}
      </div>
    </div>
  );
}
