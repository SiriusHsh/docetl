"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  RefreshCw,
  Square,
} from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
import { getBackendUrl } from "@/lib/api-config";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

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

const statusLabelMap: Record<RunStatus, string> = {
  pending: "等待中",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

const statusClassMap: Record<RunStatus, string> = {
  pending: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  running: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  completed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/10 text-red-300 border-red-500/30",
  cancelled: "bg-slate-500/10 text-slate-400 border-slate-500/30",
};

const formatTimestamp = (value?: number | null) => {
  if (!value) return "-";
  return new Date(value * 1000).toLocaleString();
};

const formatDuration = (run?: RunRecord | null) => {
  if (!run?.started_at) return "-";
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

const formatCost = (value?: number | null) => {
  if (value == null) return "-";
  return `$${value.toFixed(4)}`;
};

const stringifyJson = (value?: Record<string, unknown> | null) => {
  if (!value || Object.keys(value).length === 0) return "-";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "【元数据】";
  }
};

type FilePreviewProps = {
  title: string;
  path: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  backendUrl: string;
};

const FilePreviewDialog = ({
  title,
  path,
  open,
  onOpenChange,
  backendUrl,
}: FilePreviewProps) => {
  const [content, setContent] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (pageIndex: number) => {
      if (!path) return;
      setLoading(true);
      setError(null);
      try {
        const response = await backendFetch(
          `${backendUrl}/fs/read-file-page?path=${encodeURIComponent(path)}&page=${pageIndex}`
        );
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(detail || "加载文件失败");
        }
        const data = (await response.json()) as {
          content: string;
          hasMore: boolean;
          page: number;
        };
        setContent((prev) =>
          pageIndex === 0 ? data.content : `${prev}${data.content}`
        );
        setHasMore(data.hasMore);
        setPage(data.page);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载文件失败");
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, path]
  );

  useEffect(() => {
    if (!open || !path) return;
    setContent("");
    setPage(0);
    setHasMore(false);
    void loadPage(0);
  }, [loadPage, open, path]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#151921] border border-slate-800 text-slate-100 max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-slate-100">
            {title}
          </DialogTitle>
        </DialogHeader>
        {path ? (
          <div className="space-y-3">
            <div className="text-xs text-slate-500 break-all">{path}</div>
            {error ? (
              <div className="text-sm text-red-400">{error}</div>
            ) : (
              <ScrollArea className="h-[360px] rounded-lg border border-slate-800 bg-[#0f1116] p-3">
                <pre className="text-xs text-slate-200 whitespace-pre-wrap">
                  {content || (loading ? "加载中..." : "暂无内容")}
                </pre>
              </ScrollArea>
            )}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                className="border-slate-700 text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  if (!path) return;
                  window.open(
                    `/api/readFile?path=${encodeURIComponent(path)}`,
                    "_blank"
                  );
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                打开完整文件
              </Button>
              <Button
                type="button"
                className="bg-blue-600 hover:bg-blue-500"
                disabled={!hasMore || loading}
                onClick={() => void loadPage(page + 1)}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                加载更多
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-400">暂无文件。</div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default function RunDetailPage() {
  const params = useParams();
  const runId = Array.isArray(params?.runId) ? params.runId[0] : params?.runId;
  const backendUrl = useMemo(() => getBackendUrl(), []);
  const { toast } = useToast();

  const [run, setRun] = useState<RunRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);
  const [pendingCancel, setPendingCancel] = useState(false);

  const loadRun = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await backendFetch(`${backendUrl}/runs/${runId}`);
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "加载运行详情失败");
      }
      const data = (await response.json()) as RunRecord;
      setRun(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载运行详情失败");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, runId]);

  useEffect(() => {
    void loadRun();
  }, [loadRun]);

  const handleCancel = async () => {
    if (!runId) return;
    const confirmed = window.confirm("确认取消该运行吗？");
    if (!confirmed) return;
    setPendingCancel(true);
    try {
      const response = await backendFetch(`${backendUrl}/runs/${runId}/cancel`, {
        method: "POST",
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "取消运行失败");
      }
      toast({ title: "已提交取消请求" });
      await loadRun();
    } catch (err) {
      toast({
        title: "取消失败",
        description: err instanceof Error ? err.message : "取消运行失败",
        variant: "destructive",
      });
    } finally {
      setPendingCancel(false);
    }
  };

  const canCancel =
    run?.status === "running" || run?.status === "pending";

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/console/runs"
            className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            返回运行记录
          </Link>
          {run ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs",
                statusClassMap[run.status]
              )}
            >
              {statusLabelMap[run.status]}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-slate-700 text-slate-200 hover:bg-slate-800"
            onClick={() => void loadRun()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            刷新
          </Button>
          {canCancel ? (
            <Button
              type="button"
              variant="outline"
              className="border-red-500/40 text-red-300 hover:bg-red-500/10"
              onClick={handleCancel}
              disabled={pendingCancel}
            >
              {pendingCancel ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Square className="mr-2 h-4 w-4" />
              )}
              取消
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-sm text-red-300">
          {error}
        </div>
      ) : loading && !run ? (
        <div className="rounded-2xl border border-slate-800 bg-[#151921] p-6 text-sm text-slate-400 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> 正在加载运行详情...
        </div>
      ) : run ? (
        <>
          <div className="rounded-2xl border border-slate-800 bg-[#151921] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  运行
                </div>
                <h1 className="text-2xl font-semibold text-white mt-1">
                  {run.id}
                </h1>
              </div>
              <div className="text-sm text-slate-400">
                创建时间 {formatTimestamp(run.created_at)}
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-[#0f1116] p-4">
                <div className="text-xs text-slate-500">流水线</div>
                <div className="mt-1 text-sm text-white">
                  {run.pipeline_name || "未命名流水线"}
                </div>
                <div className="text-xs text-slate-500">
                  {run.pipeline_id || "-"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0f1116] p-4">
                <div className="text-xs text-slate-500">触发方式</div>
                <div className="mt-1 text-sm text-white">{run.trigger}</div>
                <div className="text-xs text-slate-500">
                  部署 {run.deployment_id || "-"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0f1116] p-4">
                <div className="text-xs text-slate-500">时间</div>
                <div className="mt-1 text-sm text-white">
                  开始 {formatTimestamp(run.started_at)}
                </div>
                <div className="text-xs text-slate-500">
                  结束 {formatTimestamp(run.ended_at)}
                </div>
                <div className="text-xs text-slate-500">
                  耗时 {formatDuration(run)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#0f1116] p-4">
                <div className="text-xs text-slate-500">成本</div>
                <div className="mt-1 text-sm text-white">
                  {formatCost(run.cost)}
                </div>
                <div className="text-xs text-slate-500">
                  尝试次数 {run.attempt ?? 1}
                  {run.max_attempts ? ` / ${run.max_attempts}` : ""}
                </div>
              </div>
            </div>
          </div>

          {run.error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <div>
                <div className="font-semibold text-red-100">运行失败</div>
                <div className="mt-1 text-xs text-red-200 whitespace-pre-wrap">
                  {run.error}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-800 bg-[#151921] p-5 space-y-3">
              <div className="text-sm font-semibold text-white">产物</div>
              <div className="space-y-3 text-sm text-slate-300">
                <div>
                  <div className="text-xs text-slate-500">输出路径</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-200 break-all">
                      {run.output_path || "-"}
                    </span>
                    {run.output_path ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-slate-700 text-slate-200 hover:bg-slate-800"
                        onClick={() => setOutputOpen(true)}
                      >
                        预览
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">日志路径</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-200 break-all">
                      {run.log_path || "-"}
                    </span>
                    {run.log_path ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-slate-700 text-slate-200 hover:bg-slate-800"
                        onClick={() => setLogOpen(true)}
                      >
                        预览
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-[#151921] p-5">
              <div className="text-sm font-semibold text-white">元数据</div>
              <ScrollArea className="mt-3 h-[220px] rounded-lg border border-slate-800 bg-[#0f1116] p-3">
                <pre className="text-xs text-slate-200 whitespace-pre-wrap">
                  {stringifyJson(run.metadata)}
                </pre>
              </ScrollArea>
            </div>
          </div>

          <FilePreviewDialog
            title="输出预览"
            path={run.output_path}
            open={outputOpen}
            onOpenChange={setOutputOpen}
            backendUrl={backendUrl}
          />
          <FilePreviewDialog
            title="日志预览"
            path={run.log_path}
            open={logOpen}
            onOpenChange={setLogOpen}
            backendUrl={backendUrl}
          />
        </>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-[#151921] p-6 text-sm text-slate-400">
          未找到运行记录。
        </div>
      )}
    </div>
  );
}
