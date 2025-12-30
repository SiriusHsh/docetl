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
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";

import { backendFetch } from "@/lib/backendFetch";
import { getBackendUrl } from "@/lib/api-config";
import {
  readNamespace,
  subscribeToNamespaceChanges,
} from "@/lib/namespace";
import { cn } from "@/lib/utils";

type RunSummary = {
  total: number;
  running: number;
  failed: number;
  completed: number;
  cancelled: number;
  last_run_at: number | null;
};

type RunRecord = {
  id: string;
  pipeline_id?: string | null;
  pipeline_name?: string | null;
  trigger: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  created_at: number;
  started_at?: number | null;
  ended_at?: number | null;
  cost?: number | null;
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
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNamespace(readNamespace());
    return subscribeToNamespaceChanges((next) => {
      setNamespace(next);
    });
  }, []);

  useEffect(() => {
    if (!namespace) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [summaryResponse, pipelinesResponse, runsResponse] =
          await Promise.all([
          backendFetch(
            `${backendUrl}/runs/summary?namespace=${encodeURIComponent(namespace)}`
          ),
          backendFetch(
            `${backendUrl}/pipelines?namespace=${encodeURIComponent(namespace)}`
          ),
          backendFetch(
            `${backendUrl}/runs?namespace=${encodeURIComponent(namespace)}`
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

        if (runsResponse.ok) {
          const runsData = (await runsResponse.json()) as RunRecord[];
          setRuns(runsData);
        } else {
          setError((prev) => prev || "Unable to load runs");
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

  const trendData = useMemo(() => {
    const days = 14;
    const now = new Date();
    const buckets: Array<{ key: string; label: string; count: number }> = [];
    const formatLabel = (date: Date) =>
      date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      buckets.push({ key, label: formatLabel(date), count: 0 });
    }

    const bucketIndex = new Map(buckets.map((bucket, index) => [bucket.key, index]));

    runs.forEach((run) => {
      const date = new Date(run.created_at * 1000);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const index = bucketIndex.get(key);
      if (index != null) {
        buckets[index].count += 1;
      }
    });

    return buckets.map((bucket) => ({
      label: bucket.label,
      runs: bucket.count,
    }));
  }, [runs]);

  const topPipelines = useMemo(() => {
    const counts = new Map<string, { name: string; total: number; failed: number }>();
    runs.forEach((run) => {
      const name = run.pipeline_name || run.pipeline_id || "Unknown pipeline";
      const entry = counts.get(name) || { name, total: 0, failed: 0 };
      entry.total += 1;
      if (run.status === "failed") {
        entry.failed += 1;
      }
      counts.set(name, entry);
    });

    return Array.from(counts.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [runs]);

  const recentRuns = useMemo(() => runs.slice(0, 6), [runs]);

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

      <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-slate-800 bg-[#151921] p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-300">Run Volume</div>
              <div className="text-xs text-slate-500">Last 14 days</div>
            </div>
            <div className="text-xs text-slate-500">
              {runs.length} runs loaded
            </div>
          </div>
          <div className="mt-4 h-[220px]">
            {trendData.every((item) => item.runs === 0) ? (
              <div className="h-full rounded-xl border border-dashed border-slate-800 flex items-center justify-center text-sm text-slate-500">
                No run activity yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ left: -20, right: 10 }}>
                  <defs>
                    <linearGradient id="runTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "#0f1116",
                      border: "1px solid rgba(148, 163, 184, 0.2)",
                      borderRadius: 8,
                      color: "#e2e8f0",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="runs"
                    stroke="hsl(var(--chart-2))"
                    fill="url(#runTrend)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#151921] p-5">
          <div className="text-sm text-slate-300">Top Pipelines</div>
          <div className="mt-4 space-y-4">
            {topPipelines.length === 0 ? (
              <div className="text-sm text-slate-500">No pipeline activity yet.</div>
            ) : (
              topPipelines.map((pipeline) => {
                const failureRate =
                  pipeline.total > 0
                    ? Math.round((pipeline.failed / pipeline.total) * 100)
                    : 0;
                return (
                  <div key={pipeline.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-slate-200 truncate">
                        {pipeline.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {pipeline.total} runs · {failureRate}% failed
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800">
                      <div
                        className="h-1.5 rounded-full bg-emerald-500/70"
                        style={{
                          width: `${Math.min(100, Math.max(8, (pipeline.total / topPipelines[0].total) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-[#151921] p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-300">Recent Runs</div>
          <Link
            href="/console/runs"
            className="text-xs text-blue-300 hover:text-blue-200"
          >
            View all
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {recentRuns.length === 0 ? (
            <div className="text-sm text-slate-500">No runs yet.</div>
          ) : (
            recentRuns.map((run) => (
              <Link
                key={run.id}
                href={`/console/runs/${run.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0f1116] px-4 py-3 transition hover:border-slate-700"
              >
                <div>
                  <div className="text-sm text-slate-200">
                    {run.pipeline_name || "Untitled pipeline"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(run.created_at * 1000).toLocaleString()}
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  {run.status}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
