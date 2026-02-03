"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Layers,
  Loader2,
  PlayCircle,
  RefreshCw,
  Square,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { backendFetch } from "@/lib/backendFetch";
import { getBackendUrl } from "@/lib/api-config";
import { readNamespace } from "@/lib/namespace";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { subscribeRunsUpdated } from "@/lib/run-events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type RunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

type RunRecord = {
  id: string;
  namespace: string;
  pipeline_id?: string | null;
  pipeline_name?: string | null;
  trigger: string;
  deployment_id?: string | null;
  status: RunStatus;
  created_at: number;
  started_at?: number | null;
  ended_at?: number | null;
  cost?: number | null;
  output_path?: string | null;
  log_path?: string | null;
  error?: string | null;
  metadata?: Record<string, unknown> | null;
  scheduled_for?: number | null;
  attempt?: number;
  max_attempts?: number | null;
  triggered_by_user_id?: string | null;
};

type RunSummary = {
  total: number;
  running: number;
  failed: number;
  completed: number;
  cancelled: number;
  last_run_at: number | null;
};

type PipelineRecord = {
  id: string;
  name: string;
};

const STATUS_OPTIONS: Array<{ value: RunStatus | "all"; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "pending", label: "等待中" },
  { value: "running", label: "运行中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "cancelled", label: "已取消" },
];

const formatTimestamp = (value?: number | null) => {
  if (!value) return "-";
  return new Date(value * 1000).toLocaleString();
};

const formatDuration = (run: RunRecord) => {
  if (!run.started_at) return "-";
  const end = run.ended_at ? run.ended_at * 1000 : Date.now();
  const seconds = Math.max(0, Math.round((end - run.started_at * 1000) / 1000));
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}分 ${remaining}秒`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}小时 ${mins}分`;
};

const statusLabelMap: Record<RunStatus, string> = {
  pending: "等待中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

const statusClassMap: Record<RunStatus, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  running: "bg-sky-50 text-sky-700 border-sky-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
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

export default function RunsPage() {
  const { toast } = useToast();
  const backendUrl = useMemo(() => getBackendUrl(), []);
  const namespace = readNamespace() || "default";
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [overviewRuns, setOverviewRuns] = useState<RunRecord[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [pipelines, setPipelines] = useState<PipelineRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RunStatus | "all">("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>(
    {}
  );
  const loadingRef = useRef(false);
  const overviewLoadingRef = useRef(false);

  const loadPipelines = useCallback(async () => {
    try {
      const response = await backendFetch(
        `${backendUrl}/pipelines?namespace=${encodeURIComponent(namespace)}`
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "加载流水线失败");
      }
      const data = (await response.json()) as PipelineRecord[];
      setPipelines(data);
    } catch (err) {
      toast({
        title: "加载流水线失败",
        description: err instanceof Error ? err.message : "未知错误",
        variant: "destructive",
      });
    }
  }, [backendUrl, namespace, toast]);

  const loadOverview = useCallback(async () => {
    if (overviewLoadingRef.current) return;
    overviewLoadingRef.current = true;
    try {
      const [summaryResponse, runsResponse] = await Promise.all([
        backendFetch(
          `${backendUrl}/runs/summary?namespace=${encodeURIComponent(namespace)}`
        ),
        backendFetch(
          `${backendUrl}/runs?namespace=${encodeURIComponent(namespace)}`
        ),
      ]);

      if (summaryResponse.ok) {
        const data = (await summaryResponse.json()) as RunSummary;
        setSummary(data);
      }

      if (runsResponse.ok) {
        const data = (await runsResponse.json()) as RunRecord[];
        setOverviewRuns(data);
      }
    } finally {
      overviewLoadingRef.current = false;
    }
  }, [backendUrl, namespace]);

  const loadRuns = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ namespace });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (pipelineFilter !== "all") params.set("pipeline_id", pipelineFilter);
      const response = await backendFetch(
        `${backendUrl}/runs?${params.toString()}`
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "加载运行记录失败");
      }
      const data = (await response.json()) as RunRecord[];
      setRuns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载运行记录失败");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [backendUrl, namespace, pipelineFilter, statusFilter]);

  useEffect(() => {
    void loadRuns();
  }, [namespace, loadRuns]);

  useEffect(() => {
    void loadOverview();
  }, [namespace, loadOverview]);

  useEffect(() => {
    void loadPipelines();
  }, [namespace, loadPipelines]);

  useEffect(() => {
    const unsubscribe = subscribeRunsUpdated(() => {
      void loadRuns();
      void loadOverview();
    });
    const intervalId = window.setInterval(() => {
      void loadRuns();
      void loadOverview();
    }, 15000);
    return () => {
      unsubscribe();
      window.clearInterval(intervalId);
    };
  }, [namespace, loadRuns]);

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

    overviewRuns.forEach((run) => {
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
  }, [overviewRuns]);

  const topPipelines = useMemo(() => {
    const counts = new Map<string, { name: string; total: number; failed: number }>();
    overviewRuns.forEach((run) => {
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
  }, [overviewRuns]);

  const filteredRuns = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return runs;
    return runs.filter((run) => {
      const pipelineName = run.pipeline_name || "";
      return (
        run.id.toLowerCase().includes(query) ||
        pipelineName.toLowerCase().includes(query) ||
        run.trigger.toLowerCase().includes(query)
      );
    });
  }, [runs, search]);

  const handleCancel = async (runId: string) => {
    const confirmed = window.confirm("确认取消该运行吗？");
    if (!confirmed) return;
    setPendingActions((prev) => ({ ...prev, [runId]: true }));
    try {
      const response = await backendFetch(`${backendUrl}/runs/${runId}/cancel`, {
        method: "POST",
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "取消运行失败");
      }
      toast({ title: "已提交取消请求" });
      await loadRuns();
    } catch (err) {
      toast({
        title: "取消失败",
        description: err instanceof Error ? err.message : "取消运行失败",
        variant: "destructive",
      });
    } finally {
      setPendingActions((prev) => ({ ...prev, [runId]: false }));
    }
  };

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">运行记录</h1>
          <p className="mt-2 text-sm text-slate-500">
            跟踪流水线执行并管理运行生命周期。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-slate-300 text-slate-700 hover:bg-slate-100"
          onClick={() => void loadRuns()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          刷新
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="流水线"
          value={pipelines.length || null}
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

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-600">运行趋势</div>
              <div className="text-xs text-slate-500">最近 14 天</div>
            </div>
            <div className="text-xs text-slate-500">
              已加载 {overviewRuns.length} 次运行
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
                    <linearGradient id="runTrendRunsPage" x1="0" y1="0" x2="0" y2="1">
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
                    fill="url(#runTrendRunsPage)"
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

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_240px_1fr]">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as RunStatus | "all")}
          >
            <SelectTrigger className="bg-white border-slate-200 text-slate-700">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200 text-slate-900">
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
            <SelectTrigger className="bg-white border-slate-200 text-slate-700">
              <SelectValue placeholder="流水线" />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200 text-slate-900">
              <SelectItem value="all">全部流水线</SelectItem>
              {pipelines.map((pipeline) => (
                <SelectItem key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="按运行 ID / 流水线 / 触发方式搜索"
            className="bg-white border-slate-200 text-slate-700"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        {error ? (
          <div className="p-6 text-sm text-red-400">{error}</div>
        ) : loading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在加载运行记录...
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            当前筛选条件下暂无运行记录。
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="border-slate-200">
                <TableHead className="text-slate-600">运行</TableHead>
                <TableHead className="text-slate-600">流水线</TableHead>
                <TableHead className="text-slate-600">状态</TableHead>
                <TableHead className="text-slate-600">触发方式</TableHead>
                <TableHead className="text-slate-600">开始时间</TableHead>
                <TableHead className="text-slate-600">耗时</TableHead>
                <TableHead className="text-slate-600 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRuns.map((run) => {
                const canCancel = run.status === "running" || run.status === "pending";
                const isPending = pendingActions[run.id];
                return (
                  <TableRow key={run.id} className="border-slate-200">
                    <TableCell>
                      <div className="text-sm text-slate-700 font-medium">
                        {run.id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatTimestamp(run.created_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-slate-700">
                        {run.pipeline_name || "未命名流水线"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {run.pipeline_id || "-"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                          statusClassMap[run.status]
                        )}
                      >
                        {statusLabelMap[run.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {run.trigger || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatTimestamp(run.started_at)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatDuration(run)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canCancel ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-300 text-red-600 hover:bg-red-50"
                            onClick={() => void handleCancel(run.id)}
                            disabled={Boolean(isPending)}
                          >
                            {isPending ? (
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Square className="mr-2 h-3.5 w-3.5" />
                            )}
                            取消
                          </Button>
                        ) : null}
                        <Link
                          href={`/console/runs/${run.id}`}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-500"
                        >
                          查看
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      
    </div>
  );
}
