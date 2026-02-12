"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Database,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  RefreshCw,
  UploadCloud,
  Loader2,
  Table2,
  CheckCircle2,
  AlertTriangle,
  Activity,
} from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
import { readNamespace } from "@/lib/namespace";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

export default function DataCenterPage() {
  const namespace = readNamespace() || "public_business";
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
  const [datasetSearch, setDatasetSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<
    "all" | "user_upload" | "pipeline_generated"
  >("all");
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

  const isExcel = useMemo(() => {
    if (!file?.name) return false;
    const lower = file.name.toLowerCase();
    return lower.endsWith(".xlsx") || lower.endsWith(".xls");
  }, [file]);

  const loadDatasets = useCallback(async () => {
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
    if (!file) return;
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

  const surfaceCardClass =
    "rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur";

  const readyCount = useMemo(
    () => datasets.filter((dataset) => dataset.ingest_status === "ready").length,
    [datasets]
  );
  const processingCount = useMemo(
    () =>
      datasets.filter((dataset) => dataset.ingest_status === "processing").length,
    [datasets]
  );
  const failedCount = useMemo(
    () => datasets.filter((dataset) => dataset.ingest_status === "failed").length,
    [datasets]
  );
  const userUploadCount = useMemo(
    () => datasets.filter((dataset) => dataset.source === "user_upload").length,
    [datasets]
  );

  const filteredDatasets = useMemo(() => {
    const query = datasetSearch.trim().toLowerCase();
    return datasets.filter((dataset) => {
      if (sourceFilter !== "all" && dataset.source !== sourceFilter) {
        return false;
      }
      if (!query) return true;
      return (
        dataset.name.toLowerCase().includes(query) ||
        dataset.id.toLowerCase().includes(query) ||
        dataset.source.toLowerCase().includes(query)
      );
    });
  }, [datasetSearch, datasets, sourceFilter]);

  return (
    <main className="min-h-screen space-y-6 bg-slate-50/40 px-4 py-6 md:px-6">
      <section
        className={cn(
          surfaceCardClass,
          "flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-white via-slate-50/80 to-blue-50/40 p-5"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50">
            <Database className="h-5 w-5 text-blue-600" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">数据货架</h1>
            <p className="mt-1 text-sm text-slate-500">
              上传并规范化 Excel/CSV/JSON 数据，沉淀可复用数据资产。
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-lg border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={() => void loadDatasets()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          刷新
        </Button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">数据集总数</span>
            <Table2 className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-3 text-4xl font-semibold leading-none text-slate-900">
            {datasets.length}
          </div>
          <div className="mt-2 text-xs text-slate-500">当前命名空间全部数据集</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white p-4 shadow-sm shadow-emerald-100/70">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">就绪</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-3 text-4xl font-semibold leading-none text-slate-900">
            {readyCount}
          </div>
          <div className="mt-2 text-xs text-slate-500">可直接被流程消费</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50/60 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">处理中</span>
            <Activity className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-3 text-4xl font-semibold leading-none text-slate-900">
            {processingCount}
          </div>
          <div className="mt-2 text-xs text-slate-500">正在解析或写入的数据集</div>
        </div>
        <div className="rounded-2xl border border-red-200 bg-gradient-to-b from-red-50/60 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">失败</span>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <div className="mt-3 text-4xl font-semibold leading-none text-slate-900">
            {failedCount}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            用户上传来源 {userUploadCount} 个
          </div>
        </div>
      </section>

      <section
        className={cn(
          surfaceCardClass,
          "bg-gradient-to-b from-white via-slate-50/60 to-white p-5"
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <UploadCloud className="h-4 w-4" />
              <span>用户上传</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              上传 Excel、CSV 或 JSON 文件。Excel 可配置工作表与表头行。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="border-slate-300 bg-white text-slate-600"
            >
              <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />
              Excel
            </Badge>
            <Badge
              variant="outline"
              className="border-slate-300 bg-white text-slate-600"
            >
              <FileText className="mr-1 h-3.5 w-3.5" />
              CSV
            </Badge>
            <Badge
              variant="outline"
              className="border-slate-300 bg-white text-slate-600"
            >
              <FileJson className="mr-1 h-3.5 w-3.5" />
              JSON
            </Badge>
          </div>
        </div>

        {error ? (
          <div
            aria-live="polite"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dataset-name" className="text-xs text-slate-500">
                数据集名称
              </Label>
              <Input
                id="dataset-name"
                name="dataset_name"
                autoComplete="off"
                value={datasetName}
                onChange={(event) => setDatasetName(event.target.value)}
                className="h-11 rounded-lg border-slate-200 bg-white text-slate-900"
                placeholder="可选显示名称…"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dataset-file" className="text-xs text-slate-500">
                文件
              </Label>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <input
                  id="dataset-file"
                  type="file"
                  accept=".json,.csv,.xlsx,.xls"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    htmlFor="dataset-file"
                    className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-slate-200 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    选择文件
                  </label>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
                    {file ? file.name : "未选择任何文件"}
                  </span>
                  {file ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-md border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                      onClick={() => setFile(null)}
                    >
                      清除
                    </Button>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  支持 xlsx / xls / csv / json
                  {file ? ` · ${formatFileSize(file.size)}` : ""}
                </div>
              </div>
            </div>
          </div>

          <div
            className={cn(
              "space-y-3 rounded-xl border border-slate-200 bg-white p-4",
              !isExcel && "bg-slate-50/70"
            )}
          >
            <div>
              <div className="text-sm font-medium text-slate-700">Excel 解析设置</div>
              <p className="mt-1 text-xs text-slate-500">
                仅当上传 Excel 文件时生效。
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sheet-name" className="text-xs text-slate-500">
                  工作表名称
                </Label>
                <Input
                  id="sheet-name"
                  name="sheet_name"
                  autoComplete="off"
                  value={sheetName}
                  onChange={(event) => setSheetName(event.target.value)}
                  disabled={!isExcel}
                  className="h-10 rounded-lg border-slate-200 bg-white text-slate-700 disabled:text-slate-400"
                  placeholder="默认：首个工作表"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sheet-index" className="text-xs text-slate-500">
                  工作表序号
                </Label>
                <Input
                  id="sheet-index"
                  name="sheet_index"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  value={sheetIndex}
                  onChange={(event) => setSheetIndex(event.target.value)}
                  disabled={!isExcel}
                  className="h-10 rounded-lg border-slate-200 bg-white text-slate-700 disabled:text-slate-400"
                  placeholder="从 0 开始"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="header-row" className="text-xs text-slate-500">
                  表头行
                </Label>
                <Input
                  id="header-row"
                  name="header_row"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  value={headerRow}
                  onChange={(event) => setHeaderRow(event.target.value)}
                  disabled={!isExcel}
                  className="h-10 rounded-lg border-slate-200 bg-white text-slate-700 disabled:text-slate-400"
                  placeholder="默认：0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-rows" className="text-xs text-slate-500">
                  最大行数
                </Label>
                <Input
                  id="max-rows"
                  name="max_rows"
                  type="number"
                  inputMode="numeric"
                  autoComplete="off"
                  value={maxRows}
                  onChange={(event) => setMaxRows(event.target.value)}
                  disabled={!isExcel}
                  className="h-10 rounded-lg border-slate-200 bg-white text-slate-700 disabled:text-slate-400"
                  placeholder="可选限制"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="h-10 rounded-lg bg-blue-600 px-4 text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="mr-2 h-4 w-4" />
            )}
            上传数据集
          </Button>
          <span className="text-xs text-slate-500">
            上传后会在后台完成标准化，处理中状态会自动刷新。
          </span>
        </div>
      </section>

      <section className={cn(surfaceCardClass, "overflow-hidden bg-white")}>
        <div className="border-b border-slate-200/80 bg-gradient-to-r from-white to-slate-50/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Table2 className="h-4 w-4" />
              <span>数据集</span>
              <Badge variant="outline" className="border-slate-300 text-slate-600">
                {filteredDatasets.length} 条
              </Badge>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">
              <Select
                value={sourceFilter}
                onValueChange={(value) =>
                  setSourceFilter(value as "all" | "user_upload" | "pipeline_generated")
                }
              >
                <SelectTrigger className="h-10 w-full rounded-lg border-slate-200 bg-white text-slate-700 sm:w-[180px]">
                  <Filter className="mr-2 h-3.5 w-3.5 text-slate-400" />
                  <SelectValue placeholder="来源筛选" />
                </SelectTrigger>
                <SelectContent className="border-slate-200 bg-white text-slate-900">
                  <SelectItem value="all">全部来源</SelectItem>
                  <SelectItem value="user_upload">用户上传</SelectItem>
                  <SelectItem value="pipeline_generated">流水线产出</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={datasetSearch}
                onChange={(event) => setDatasetSearch(event.target.value)}
                className="h-10 w-full rounded-lg border-slate-200 bg-white text-slate-700 sm:w-72"
                placeholder="按名称 / ID / 来源搜索…"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto p-2">
          <Table>
            <TableHeader className="bg-gradient-to-r from-slate-50 to-white">
              <TableRow className="border-slate-200">
                <TableHead className="text-slate-600">名称</TableHead>
                <TableHead className="text-slate-600">来源</TableHead>
                <TableHead className="text-slate-600">状态</TableHead>
                <TableHead className="text-slate-600">行数</TableHead>
                <TableHead className="text-slate-600">创建时间</TableHead>
                <TableHead className="text-right text-slate-600">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在加载数据集...
                    </span>
                  </TableCell>
                </TableRow>
              ) : filteredDatasets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-slate-500">
                    暂无匹配数据集。
                  </TableCell>
                </TableRow>
              ) : (
                filteredDatasets.map((dataset) => {
                  const displayFormat =
                    dataset.original_format?.toUpperCase() ||
                    dataset.format?.toUpperCase() ||
                    "-";
                  const normalizedFormat = dataset.format?.toUpperCase();
                  return (
                    <TableRow
                      key={dataset.id}
                      className="border-slate-200 transition-colors hover:bg-slate-50/70"
                    >
                      <TableCell>
                        <div className="font-medium text-slate-800">{dataset.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {dataset.id}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          格式 {displayFormat}
                          {dataset.original_format && normalizedFormat
                            ? ` → ${normalizedFormat}`
                            : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {sourceLabels[dataset.source] || dataset.source}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                              dataset.ingest_status === "ready" &&
                                "border-emerald-200 bg-emerald-50 text-emerald-700",
                              dataset.ingest_status === "failed" &&
                                "border-red-200 bg-red-50 text-red-700",
                              dataset.ingest_status === "processing" &&
                                "border-amber-200 bg-amber-50 text-amber-700",
                              dataset.ingest_status === "pending" &&
                                "border-slate-200 bg-slate-100 text-slate-600"
                            )}
                          >
                            {ingestStatusLabels[dataset.ingest_status] ||
                              dataset.ingest_status}
                          </span>
                          {dataset.ingest_status === "processing" &&
                          dataset.ingest_config?.progress ? (
                            <>
                              <div className="text-[11px] text-slate-500">
                                {progressStateLabels[
                                  dataset.ingest_config.progress.state || "processing"
                                ] ||
                                  dataset.ingest_config.progress.state ||
                                  "处理中"}
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
                              </div>
                              <div className="h-1.5 w-32 rounded-full bg-slate-200">
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
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {dataset.row_count ?? "-"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatTimestamp(dataset.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void openPreview(dataset)}
                            className="h-8 rounded-full border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                            disabled={dataset.ingest_status !== "ready"}
                          >
                            预览
                          </Button>
                          <Link
                            href={`/console/data-center/${dataset.id}`}
                            className="inline-flex h-8 items-center rounded-full border border-slate-200 px-3 text-xs text-slate-600 transition-colors hover:bg-slate-50"
                          >
                            详情
                          </Link>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setDatasetToDelete(dataset)}
                            className="h-8 rounded-full border-red-200 text-xs text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-40"
                            disabled={deletingId === dataset.id}
                          >
                            {deletingId === dataset.id ? "删除中..." : "删除"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[85vh] w-[min(96vw,64rem)] max-w-4xl flex-col overflow-hidden border-slate-200/90 bg-white">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              预览：{previewDatasetName || "数据集"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge variant="outline" className="border-slate-300 text-slate-600">
                总行数 {previewTotal}
              </Badge>
              <Badge variant="outline" className="border-slate-300 text-slate-600">
                当前显示 {previewItems.length}
              </Badge>
              {previewSampleMode ? (
                <Badge variant="outline" className="border-blue-200 text-blue-700">
                  抽样模式
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-md border-slate-200 text-xs text-slate-600"
                disabled={
                  !previewDatasetId ||
                  previewLoading ||
                  previewOffset <= 0 ||
                  previewSampleMode
                }
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
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-md border-slate-200 text-xs text-slate-600"
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
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 rounded-md border-slate-200 text-xs text-slate-600"
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
              </Button>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
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
    </main>
  );
}
