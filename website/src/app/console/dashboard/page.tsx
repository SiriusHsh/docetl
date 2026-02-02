"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { readNamespace } from "@/lib/namespace";
import { subscribeRunsUpdated } from "@/lib/run-events";
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
        "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm",
        highlight && "border-emerald-300 shadow-emerald-100/60"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">{label}</span>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">
        {value ?? "--"}
      </div>
      {helper ? <div className="mt-1 text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

export default function DashboardPage() {
  const backendUrl = useMemo(() => getBackendUrl(), []);
  const namespace = readNamespace();
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [pipelineCount, setPipelineCount] = useState<number | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const loadDashboard = useCallback(async () => {
    if (!namespace || loadingRef.current) return;

    loadingRef.current = true;
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

      if (summaryResponse.ok) {
        const data = (await summaryResponse.json()) as RunSummary;
        setSummary(data);
      } else {
        setError("无法加载运行汇总");
      }

      if (pipelinesResponse.ok) {
        const pipelines = (await pipelinesResponse.json()) as Array<unknown>;
        setPipelineCount(pipelines.length);
      } else {
        setError((prev) => prev || "无法加载流水线列表");
      }

      if (runsResponse.ok) {
        const runsData = (await runsResponse.json()) as RunRecord[];
        setRuns(runsData);
      } else {
        setError((prev) => prev || "无法加载运行记录");
      }
    } catch (err) {
      setError("加载仪表盘数据失败");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [backendUrl, namespace]);

  useEffect(() => {
    if (!namespace) return;
    void loadDashboard();
  }, [namespace, loadDashboard]);

  useEffect(() => {
    if (!namespace) return;
    const unsubscribe = subscribeRunsUpdated(() => {
      void loadDashboard();
    });
    const intervalId = window.setInterval(() => {
      void loadDashboard();
    }, 15000);
    return () => {
      unsubscribe();
      window.clearInterval(intervalId);
    };
  }, [namespace, loadDashboard]);

  const lastRunText = summary?.last_run_at
    ? new Date(summary.last_run_at * 1000).toLocaleString()
    : "暂无运行记录";

  const runStatusLabels: Record<RunRecord["status"], string> = {
    pending: "等待中",
    running: "运行中",
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
  };

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
      const name = run.pipeline_name || run.pipeline_id || "未知流水线";
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
          <h1 className="text-2xl font-semibold text-slate-900">看板</h1>
        <p className="text-sm text-slate-500">运行概览与统计。</p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="流水线"
          value={pipelineCount}
          helper="已登记流水线"
          icon={Layers}
        />
        <StatCard
          label="运行中"
          value={summary?.running ?? null}
          helper={loading ? "加载中..." : "进行中的运行"}
          icon={Activity}
          highlight
        />
        <StatCard
          label="失败"
          value={summary?.failed ?? null}
          helper="需要关注的运行"
          icon={AlertTriangle}
        />
        <StatCard
          label="总运行数"
          value={summary?.total ?? null}
          helper="累计执行"
          icon={PlayCircle}
        />
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-600">最近一次运行</div>
            <div className="mt-1 text-lg font-medium text-slate-900">{lastRunText}</div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
            <Timer className="h-3 w-3" />
            <span>{loading ? "同步中" : "已同步"}</span>
          </div>
        </div>
        {error ? (
          <div className="mt-3 text-sm text-rose-300">{error}</div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-600">运行趋势</div>
              <div className="text-xs text-slate-500">最近 14 天</div>
            </div>
            <div className="text-xs text-slate-500">
              已加载 {runs.length} 次运行
            </div>
          </div>
          <div className="mt-4 h-[220px]">
            {trendData.every((item) => item.runs === 0) ? (
              <div className="h-full rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-sm text-slate-500">
                暂无运行活动
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
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      border: "1px solid rgba(148, 163, 184, 0.3)",
                      borderRadius: 8,
                      color: "#0f172a",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#64748b" }}
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

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm text-slate-600">热门流水线</div>
          <div className="mt-4 space-y-4">
            {topPipelines.length === 0 ? (
              <div className="text-sm text-slate-500">暂无流水线活动。</div>
            ) : (
              topPipelines.map((pipeline) => {
                const failureRate =
                  pipeline.total > 0
                    ? Math.round((pipeline.failed / pipeline.total) * 100)
                    : 0;
                return (
                  <div key={pipeline.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-slate-700 truncate">
                        {pipeline.name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {pipeline.total} 次运行 · {failureRate}% 失败
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
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

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-600">最近运行</div>
          <Link
            href="/console/runs"
            className="text-xs text-blue-600 hover:text-blue-500"
          >
            查看全部
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {recentRuns.length === 0 ? (
            <div className="text-sm text-slate-500">暂无运行记录。</div>
          ) : (
            recentRuns.map((run) => (
              <Link
                key={run.id}
                href={`/console/runs/${run.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div>
                  <div className="text-sm text-slate-700">
                    {run.pipeline_name || "未命名流水线"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(run.created_at * 1000).toLocaleString()}
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  {runStatusLabels[run.status] || run.status}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
