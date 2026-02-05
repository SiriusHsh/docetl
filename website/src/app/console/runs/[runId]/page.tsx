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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  running: "bg-sky-50 text-sky-700 border-sky-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-600 border-slate-200",
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
      <DialogContent className="bg-white border border-slate-200 text-slate-900 max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-slate-900">
            {title}
          </DialogTitle>
        </DialogHeader>
        {path ? (
          <div className="space-y-3">
            <div className="text-xs text-slate-500 break-all">{path}</div>
            {error ? (
              <div className="text-sm text-red-400">{error}</div>
            ) : (
              <ScrollArea className="h-[360px] rounded-lg border border-slate-200 bg-slate-50 p-3">
                <pre className="w-full max-w-full text-xs text-slate-700 whitespace-pre-wrap break-all">
                  {content || (loading ? "加载中..." : "暂无内容")}
                </pre>
              </ScrollArea>
            )}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                className="border-slate-200 text-slate-600 hover:bg-slate-50"
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
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

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

  const cancelRun = async () => {
    if (!runId) return;
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

  const confirmCancel = async () => {
    setCancelDialogOpen(false);
    await cancelRun();
  };

  const canCancel =
    run?.status === "running" || run?.status === "pending";

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/console/runs"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
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
            className="border-slate-300 text-slate-700 hover:bg-slate-100"
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
              className="rounded-full border-red-200/80 bg-red-50/70 text-red-600 shadow-sm transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-700 hover:shadow-md focus-visible:ring-red-200 disabled:border-red-200/60 disabled:bg-red-50/40 disabled:text-red-400"
              onClick={() => setCancelDialogOpen(true)}
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

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent className="max-w-md border-slate-200 bg-white p-6">
          <AlertDialogHeader className="text-left">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <AlertDialogTitle className="text-base text-slate-900">
                  确认取消运行？
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-slate-600">
                  取消后运行将立即终止，当前结果可能不完整。
                </AlertDialogDescription>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <div className="font-medium text-slate-700">
                    {run?.pipeline_name || "未命名流水线"}
                  </div>
                  <div className="mt-1 break-all text-slate-500">
                    运行 ID · {run?.id || runId}
                  </div>
                </div>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="rounded-full border-slate-200 text-slate-600 hover:bg-slate-50">
              继续运行
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-red-600 text-white shadow-sm hover:bg-red-500 focus-visible:ring-red-200"
              onClick={() => void confirmCancel()}
              disabled={pendingCancel}
            >
              {pendingCancel ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Square className="mr-2 h-4 w-4" />
              )}
              确认取消
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      ) : loading && !run ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> 正在加载运行详情...
        </div>
      ) : run ? (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  运行
                </div>
                <h1 className="text-2xl font-semibold text-slate-900 mt-1">
                  {run.id}
                </h1>
              </div>
              <div className="text-sm text-slate-500">
                创建时间 {formatTimestamp(run.created_at)}
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">流水线</div>
                <div className="mt-1 text-sm text-slate-900">
                  {run.pipeline_name || "未命名流水线"}
                </div>
                <div className="text-xs text-slate-500">
                  {run.pipeline_id || "-"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">触发方式</div>
                <div className="mt-1 text-sm text-slate-900">{run.trigger}</div>
                <div className="text-xs text-slate-500">
                  部署 {run.deployment_id || "-"}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">时间</div>
                <div className="mt-1 text-sm text-slate-900">
                  开始 {formatTimestamp(run.started_at)}
                </div>
                <div className="text-xs text-slate-500">
                  结束 {formatTimestamp(run.ended_at)}
                </div>
                <div className="text-xs text-slate-500">
                  耗时 {formatDuration(run)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">成本</div>
                <div className="mt-1 text-sm text-slate-900">
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
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <div>
                <div className="font-semibold text-red-700">运行失败</div>
                <div className="mt-1 text-xs text-red-700 whitespace-pre-wrap">
                  {run.error}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="text-sm font-semibold text-slate-900">产物</div>
              <div className="space-y-3 text-sm text-slate-600">
                <div>
                  <div className="text-xs text-slate-500">输出路径</div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-700 break-all">
                      {run.output_path || "-"}
                    </span>
                    {run.output_path ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-slate-300 text-slate-700 hover:bg-slate-100"
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
                    <span className="text-slate-700 break-all">
                      {run.log_path || "-"}
                    </span>
                    {run.log_path ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-slate-300 text-slate-700 hover:bg-slate-100"
                        onClick={() => setLogOpen(true)}
                      >
                        预览
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-sm font-semibold text-slate-900">元数据</div>
              <ScrollArea className="mt-3 h-[220px] rounded-lg border border-slate-200 bg-slate-50 p-3">
                <pre className="text-xs text-slate-700 whitespace-pre-wrap">
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
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          未找到运行记录。
        </div>
      )}
    </div>
  );
}
