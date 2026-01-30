"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Database,
  UploadCloud,
  Loader2,
  Table2,
} from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
import {
  readNamespace,
  subscribeToNamespaceChanges,
} from "@/lib/namespace";
import { cn } from "@/lib/utils";
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
  ingest_status: string;
  ingest_config?: {
    progress?: {
      state?: string;
      percent?: number;
      message?: string;
      queue_position?: number;
    };
  } | null;
  row_count?: number | null;
  created_at: number;
};

export default function DataCenterPage() {
  const [namespace, setNamespace] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [sheetIndex, setSheetIndex] = useState("");
  const [headerRow, setHeaderRow] = useState("");
  const [maxRows, setMaxRows] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState<unknown[]>([]);
  const [previewTotal, setPreviewTotal] = useState<number>(0);
  const [previewOffset, setPreviewOffset] = useState(0);
  const [previewLimit, setPreviewLimit] = useState(20);
  const [previewDatasetName, setPreviewDatasetName] = useState<string | null>(
    null
  );
  const [previewDatasetId, setPreviewDatasetId] = useState<string | null>(null);
  const [previewSampleMode, setPreviewSampleMode] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [datasetToDelete, setDatasetToDelete] =
    useState<DatasetRecord | null>(null);

  useEffect(() => {
    setNamespace(readNamespace());
    return subscribeToNamespaceChanges((next) => {
      setNamespace(next);
    });
  }, []);

  const isExcel = useMemo(() => {
    if (!file?.name) return false;
    const lower = file.name.toLowerCase();
    return lower.endsWith(".xlsx") || lower.endsWith(".xls");
  }, [file]);

  const loadDatasets = useCallback(async () => {
    if (!namespace) return;
    setLoading(true);
    setError(null);
    try {
      const response = await backendFetch(
        `/api/data-center/datasets?namespace=${encodeURIComponent(namespace)}`
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "加载数据集失败");
      }
      const data = (await response.json()) as DatasetRecord[];
      setDatasets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载数据集失败");
    } finally {
      setLoading(false);
    }
  }, [namespace]);

  useEffect(() => {
    void loadDatasets();
  }, [loadDatasets]);

  useEffect(() => {
    if (!namespace) return;
    const hasProcessing = datasets.some(
      (dataset) => dataset.ingest_status === "processing"
    );
    if (!hasProcessing) return;
    const timer = setTimeout(() => {
      void loadDatasets();
    }, 3000);
    return () => clearTimeout(timer);
  }, [datasets, loadDatasets, namespace]);

  const handleUpload = async () => {
    if (!namespace || !file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("namespace", namespace);
      formData.append("file", file);
      if (datasetName.trim()) {
        formData.append("name", datasetName.trim());
      }
      if (sheetName.trim()) {
        formData.append("sheet_name", sheetName.trim());
      }
      if (sheetIndex.trim()) {
        formData.append("sheet_index", sheetIndex.trim());
      }
      if (headerRow.trim()) {
        formData.append("header_row", headerRow.trim());
      }
      if (maxRows.trim()) {
        formData.append("max_rows", maxRows.trim());
      }

      const response = await backendFetch("/api/data-center/datasets/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "上传失败");
      }

      setFile(null);
      setDatasetName("");
      setSheetName("");
      setSheetIndex("");
      setHeaderRow("");
      setMaxRows("");
      await loadDatasets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (dataset: DatasetRecord) => {
    if (!namespace) return;
    setDeletingId(dataset.id);
    setError(null);
    try {
      const response = await backendFetch(
        `/api/data-center/datasets/${dataset.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "删除数据集失败");
      }
      await loadDatasets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const fetchPreview = async ({
    datasetId,
    offset = 0,
    limit = previewLimit,
    sample = false,
  }: {
    datasetId: string;
    offset?: number;
    limit?: number;
    sample?: boolean;
  }) => {
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

  const openPreview = async (dataset: DatasetRecord) => {
    setPreviewDatasetName(dataset.name);
    setPreviewDatasetId(dataset.id);
    setPreviewItems([]);
    setPreviewOffset(0);
    setPreviewLimit(20);
    setPreviewTotal(0);
    setPreviewSampleMode(false);
    setPreviewOpen(true);
    await fetchPreview({ datasetId: dataset.id, offset: 0, limit: 20 });
  };

  const formatTimestamp = (value: number) =>
    new Date(value * 1000).toLocaleString();

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

  const sourceLabels: Record<string, string> = {
    user_upload: "用户上传",
    pipeline_generated: "流水线产出",
  };

  return (
    <div className="px-6 py-6">
      <div className="flex items-center gap-3">
        <Database className="h-6 w-6 text-slate-600" />
        <h1 className="text-2xl font-semibold text-slate-900">数据货架</h1>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        上传数据集并将 Excel/CSV/JSON 规范化为可复用的数据集。
      </p>

      <div className="mt-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <UploadCloud className="h-4 w-4" />
            <span>用户上传</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            上传 Excel、CSV 或 JSON。Excel 文件可配置工作表与表头信息。
          </p>

          <div className="mt-4 space-y-3 text-sm text-slate-700">
            <div>
              <label className="text-xs text-slate-500">数据集名称</label>
              <input
                value={datasetName}
                onChange={(event) => setDatasetName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                placeholder="可选显示名称"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">文件</label>
              <input
                type="file"
                accept=".json,.csv,.xlsx,.xls"
                onChange={(event) =>
                  setFile(event.target.files?.[0] ?? null)
                }
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              />
            </div>

            <div className={cn("grid gap-3 md:grid-cols-2", !isExcel && "opacity-60")}>
              <div>
                <label className="text-xs text-slate-500">工作表名称</label>
                <input
                  value={sheetName}
                  onChange={(event) => setSheetName(event.target.value)}
                  disabled={!isExcel}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 disabled:text-slate-400"
                  placeholder="默认：首个工作表"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">工作表序号</label>
                <input
                  value={sheetIndex}
                  onChange={(event) => setSheetIndex(event.target.value)}
                  disabled={!isExcel}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 disabled:text-slate-400"
                  placeholder="从 0 开始的序号"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">表头行</label>
                <input
                  value={headerRow}
                  onChange={(event) => setHeaderRow(event.target.value)}
                  disabled={!isExcel}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 disabled:text-slate-400"
                  placeholder="默认：0"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">最大行数</label>
                <input
                  value={maxRows}
                  onChange={(event) => setMaxRows(event.target.value)}
                  disabled={!isExcel}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 disabled:text-slate-400"
                  placeholder="可选限制"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || !namespace || uploading}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              上传数据集
            </button>
            {error ? <div className="text-xs text-rose-600">{error}</div> : null}
          </div>
        </div>

      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Table2 className="h-4 w-4" />
          <span>数据集</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2 pr-4">名称</th>
                <th className="py-2 pr-4">来源</th>
                <th className="py-2 pr-4">状态</th>
                <th className="py-2 pr-4">行数</th>
                <th className="py-2 pr-4">创建时间</th>
                <th className="py-2 pr-4">预览</th>
                <th className="py-2 pr-4">详情</th>
                <th className="py-2 pr-4">删除</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-4 text-slate-500">
                    正在加载数据集...
                  </td>
                </tr>
              ) : datasets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-4 text-slate-500">
                    暂无数据集。
                  </td>
                </tr>
              ) : (
                datasets.map((dataset) => (
                  <tr key={dataset.id} className="border-t border-slate-200">
                    <td className="py-3 pr-4">{dataset.name}</td>
                    <td className="py-3 pr-4">
                      {sourceLabels[dataset.source] || dataset.source}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-col gap-1">
                        <span
                          className={cn(
                            "text-xs",
                            dataset.ingest_status === "ready" &&
                              "text-emerald-600",
                            dataset.ingest_status === "failed" &&
                              "text-rose-600",
                            dataset.ingest_status === "processing" &&
                              "text-amber-600"
                          )}
                        >
                          {ingestStatusLabels[dataset.ingest_status] ||
                            dataset.ingest_status}
                        </span>
                        {dataset.ingest_status === "processing" &&
                        dataset.ingest_config?.progress ? (
                          <>
                            <span className="text-[10px] text-slate-500">
                              {progressStateLabels[
                                dataset.ingest_config.progress.state ||
                                  "processing"
                              ] || dataset.ingest_config.progress.state || "处理中"}
                              {typeof dataset.ingest_config.progress.queue_position ===
                              "number"
                                ? ` (#${dataset.ingest_config.progress.queue_position})`
                                : ""}
                              {typeof dataset.ingest_config.progress.percent ===
                              "number"
                                ? ` · ${Math.round(
                                    dataset.ingest_config.progress.percent
                                  )}%`
                                : ""}
                            </span>
                            <div className="h-1.5 w-28 rounded-full bg-slate-200">
                              <div
                                className="h-1.5 rounded-full bg-blue-500"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.max(
                                      0,
                                      dataset.ingest_config.progress.percent ?? 0
                                    )
                                  )}%`,
                                }}
                              />
                            </div>
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 pr-4">{dataset.row_count ?? "-"}</td>
                    <td className="py-3 pr-4">
                      {formatTimestamp(dataset.created_at)}
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        onClick={() => void openPreview(dataset)}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={dataset.ingest_status !== "ready"}
                      >
                        预览
                      </button>
                    </td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/console/data-center/${dataset.id}`}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      >
                        详情
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        onClick={() => setDatasetToDelete(dataset)}
                        className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={deletingId === dataset.id}
                      >
                        {deletingId === dataset.id ? "删除中..." : "删除"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] w-[min(96vw,64rem)] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              预览：{previewDatasetName || "数据集"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 flex-1 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>总行数：{previewTotal}</span>
              <span>当前显示：{previewItems.length}</span>
              {previewSampleMode ? <span>抽样模式</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                disabled={!previewDatasetId || previewLoading || previewOffset <= 0 || previewSampleMode}
                onClick={() =>
                  previewDatasetId
                    ? fetchPreview({
                        datasetId: previewDatasetId,
                        offset: Math.max(previewOffset - previewLimit, 0),
                        limit: previewLimit,
                      })
                    : null
                }
              >
                上一页
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                disabled={
                  !previewDatasetId ||
                  previewLoading ||
                  previewSampleMode ||
                  previewOffset + previewLimit >= previewTotal
                }
                onClick={() =>
                  previewDatasetId
                    ? fetchPreview({
                        datasetId: previewDatasetId,
                        offset: previewOffset + previewLimit,
                        limit: previewLimit,
                      })
                    : null
                }
              >
                下一页
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                disabled={!previewDatasetId || previewLoading}
                onClick={() =>
                  previewDatasetId
                    ? fetchPreview({
                        datasetId: previewDatasetId,
                        limit: previewLimit,
                        sample: true,
                      })
                    : null
                }
              >
                随机抽样
              </button>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              {previewLoading ? (
                <div className="flex items-center gap-2 text-slate-500">
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

      <AlertDialog
        open={datasetToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDatasetToDelete(null);
          }
        }}
      >
        <AlertDialogContent className="border border-slate-200 bg-white text-slate-900 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-900">
              删除数据集
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">
              将永久删除{" "}
              <span className="font-semibold text-slate-900">
                {datasetToDelete?.name}
              </span>{" "}
              及其存储文件，无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-200 text-slate-700 hover:bg-slate-100">
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (datasetToDelete) {
                  void handleDelete(datasetToDelete);
                }
                setDatasetToDelete(null);
              }}
              className="bg-rose-600 text-white hover:bg-rose-500"
              disabled={!!deletingId}
            >
              {deletingId ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
