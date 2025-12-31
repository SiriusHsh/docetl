"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Database, Loader2, GitBranch, Table2 } from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

type DatasetRecord = {
  id: string;
  name: string;
  source: string;
  format: string;
  original_format?: string | null;
  raw_path?: string | null;
  path: string;
  ingest_status: string;
  ingest_config?: Record<string, unknown> | null;
  created_at: number;
  updated_at: number;
  row_count?: number | null;
  lineage?: Record<string, unknown> | null;
  description?: string | null;
  error?: string | null;
};

export default function DataCenterDatasetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const datasetId = Array.isArray(params.datasetId)
    ? params.datasetId[0]
    : params.datasetId;
  const [dataset, setDataset] = useState<DatasetRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState<unknown[]>([]);
  const [previewTotal, setPreviewTotal] = useState<number>(0);
  const [previewOffset, setPreviewOffset] = useState(0);
  const [previewLimit, setPreviewLimit] = useState(20);
  const [previewSampleMode, setPreviewSampleMode] = useState(false);

  useEffect(() => {
    if (!datasetId) return;
    let isMounted = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchDataset = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await backendFetch(
          `/api/data-center/datasets/${datasetId}`
        );
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(detail || "加载数据集失败");
        }
        const data = (await response.json()) as DatasetRecord;
        if (isMounted) {
          setDataset(data);
          if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
          }
          if (data.ingest_status === "processing") {
            refreshTimer = setTimeout(() => {
              void fetchDataset();
            }, 3000);
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "加载数据集失败");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void fetchDataset();

    return () => {
      isMounted = false;
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, [datasetId]);

  const formatTimestamp = (value?: number | null) =>
    value ? new Date(value * 1000).toLocaleString() : "-";

  const sourceLabels: Record<string, string> = {
    user_upload: "用户上传",
    pipeline_generated: "流水线产出",
  };

  const ingestStatusLabels: Record<string, string> = {
    ready: "就绪",
    failed: "失败",
    processing: "处理中",
    pending: "等待中",
  };

  const progressStateLabels: Record<string, string> = {
    queued: "排队中",
    processing: "处理中",
    parsing: "解析中",
    writing: "写入中",
    finalizing: "收尾中",
    retrying: "重试中",
    failed: "失败",
    completed: "已完成",
  };

  const lineage = useMemo(() => {
    if (!dataset?.lineage) return null;
    return dataset.lineage;
  }, [dataset]);

  const hasLineage = lineage && Object.keys(lineage).length > 0;
  const ingestProgress = useMemo(() => {
    if (!dataset?.ingest_config) return null;
    const config = dataset.ingest_config as {
      progress?: {
        state?: string;
        percent?: number;
        message?: string;
        queue_position?: number;
      };
    };
    return config.progress ?? null;
  }, [dataset]);

  const fetchPreview = async ({
    offset = 0,
    limit = previewLimit,
    sample = false,
  }: {
    offset?: number;
    limit?: number;
    sample?: boolean;
  }) => {
    if (!datasetId) return;
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (sample) {
        params.set("sample", "true");
        params.set("sample_size", String(limit));
      }
      const response = await backendFetch(
        `/api/data-center/datasets/${datasetId}/preview?${params.toString()}`
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "预览数据集失败");
      }
      const data = (await response.json()) as {
        items: unknown[];
        total: number;
        offset: number;
        limit: number;
        sample: boolean;
      };
      setPreviewItems(data.items);
      setPreviewTotal(data.total);
      setPreviewOffset(data.offset);
      setPreviewLimit(data.limit);
      setPreviewSampleMode(data.sample);
    } catch (err) {
      setError(err instanceof Error ? err.message : "预览失败");
    } finally {
      setPreviewLoading(false);
    }
  };

  const openPreview = async () => {
    setPreviewItems([]);
    setPreviewOffset(0);
    setPreviewLimit(20);
    setPreviewTotal(0);
    setPreviewSampleMode(false);
    setPreviewOpen(true);
    await fetchPreview({ offset: 0, limit: 20 });
  };

  const handleDelete = async () => {
    if (!datasetId || !dataset) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await backendFetch(
        `/api/data-center/datasets/${datasetId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "删除数据集失败");
      }
      router.push("/console/data-center");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/console/data-center"
            className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-200 hover:border-white/20 hover:bg-white/10"
          >
            返回
          </Link>
          <Database className="h-6 w-6 text-slate-200" />
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {dataset?.name || "数据集"}
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              {sourceLabels[dataset?.source || ""] ||
                dataset?.source ||
                "数据中心"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void openPreview()}
            className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-200 hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
            disabled={!datasetId || dataset?.ingest_status !== "ready"}
          >
            预览
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="rounded-md border border-rose-500/40 px-3 py-2 text-xs text-rose-200 hover:border-rose-400/70 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!datasetId || deleting}
          >
            {deleting ? "删除中..." : "删除"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载数据集...
        </div>
      ) : error ? (
        <div className="mt-8 text-sm text-rose-300">{error}</div>
      ) : dataset ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <Table2 className="h-4 w-4" />
              <span>数据集概览</span>
            </div>
            <div className="mt-4 grid gap-4 text-sm text-slate-200 sm:grid-cols-2">
              <div>
                <div className="text-xs text-slate-400">状态</div>
                <div className="mt-1">
                  {ingestStatusLabels[dataset.ingest_status] ||
                    dataset.ingest_status}
                </div>
              </div>
              {ingestProgress ? (
                <div>
                  <div className="text-xs text-slate-400">进度</div>
                  <div className="mt-1 text-sm text-slate-200">
                    {progressStateLabels[ingestProgress.state || "processing"] ||
                      ingestProgress.state ||
                      "处理中"}
                    {typeof ingestProgress.queue_position === "number"
                      ? ` (#${ingestProgress.queue_position})`
                      : ""}
                    {typeof ingestProgress.percent === "number"
                      ? ` · ${Math.round(ingestProgress.percent)}%`
                      : ""}
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                    <div
                      className="h-1.5 rounded-full bg-blue-500"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, ingestProgress.percent ?? 0)
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
              <div>
                <div className="text-xs text-slate-400">行数</div>
                <div className="mt-1">{dataset.row_count ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">格式</div>
                <div className="mt-1">
                  {dataset.format}
                  {dataset.original_format
                    ? ` (${dataset.original_format})`
                    : ""}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">创建时间</div>
                <div className="mt-1">{formatTimestamp(dataset.created_at)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">更新时间</div>
                <div className="mt-1">{formatTimestamp(dataset.updated_at)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">数据集 ID</div>
                <div className="mt-1 break-all text-xs text-slate-300">
                  {dataset.id}
                </div>
              </div>
            </div>
            {dataset.error ? (
              <div className="mt-4 text-xs text-rose-300">{dataset.error}</div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <GitBranch className="h-4 w-4" />
              <span>血缘</span>
            </div>
            <div className="mt-4 text-sm text-slate-200">
              {hasLineage ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-slate-400">流水线</div>
                      <div className="mt-1">
                        {(typeof lineage?.pipeline_name === "string" &&
                          lineage?.pipeline_name) ||
                          (typeof lineage?.pipeline_id === "string" &&
                            lineage?.pipeline_id) ||
                          "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">运行 ID</div>
                      <div className="mt-1">
                        {(typeof lineage?.run_id === "string" &&
                          lineage?.run_id) ||
                          "-"}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <div className="text-xs text-slate-400">输出路径</div>
                      <div className="mt-1 break-all text-xs text-slate-300">
                        {(typeof lineage?.output_path === "string" &&
                          lineage?.output_path) ||
                          "-"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-slate-100">
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(lineage, null, 2)}
                    </pre>
                  </div>
                </>
              ) : (
                <div className="text-xs text-slate-400">
                  当前数据集暂无血缘信息。
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              预览：{dataset?.name || "数据集"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>总行数：{previewTotal}</span>
              <span>当前显示：{previewItems.length}</span>
              {previewSampleMode ? <span>抽样模式</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200 hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
                disabled={previewLoading || previewOffset <= 0 || previewSampleMode}
                onClick={() =>
                  fetchPreview({
                    offset: Math.max(previewOffset - previewLimit, 0),
                    limit: previewLimit,
                  })
                }
              >
                上一页
              </button>
              <button
                type="button"
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200 hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
                disabled={
                  previewLoading ||
                  previewSampleMode ||
                  previewOffset + previewLimit >= previewTotal
                }
                onClick={() =>
                  fetchPreview({
                    offset: previewOffset + previewLimit,
                    limit: previewLimit,
                  })
                }
              >
                下一页
              </button>
              <button
                type="button"
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200 hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
                disabled={previewLoading}
                onClick={() =>
                  fetchPreview({
                    limit: previewLimit,
                    sample: true,
                  })
                }
              >
                随机抽样
              </button>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-slate-100">
              {previewLoading ? (
                <div className="flex items-center gap-2 text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在加载预览...
                </div>
              ) : (
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap">
                  {JSON.stringify(previewItems, null, 2)}
                </pre>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="border border-white/10 bg-slate-950 text-slate-100 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">
              删除数据集
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              将永久删除{" "}
              <span className="font-semibold text-slate-200">
                {dataset?.name}
              </span>{" "}
              及其存储文件，无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 text-slate-200 hover:bg-white/5">
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDeleteOpen(false);
                void handleDelete();
              }}
              className="bg-rose-600 text-white hover:bg-rose-500"
              disabled={deleting}
            >
              {deleting ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
