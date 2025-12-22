"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Database,
  FileText,
  UploadCloud,
  Loader2,
  Table2,
} from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
import * as localStorageKeys from "@/app/localStorageKeys";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DatasetRecord = {
  id: string;
  name: string;
  source: string;
  format: string;
  original_format?: string | null;
  ingest_status: string;
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

  useEffect(() => {
    const stored = window.localStorage.getItem(localStorageKeys.NAMESPACE_KEY);
    if (!stored) return;
    try {
      setNamespace(JSON.parse(stored));
    } catch {
      setNamespace(stored);
    }
  }, []);

  const isExcel = useMemo(() => {
    if (!file?.name) return false;
    const lower = file.name.toLowerCase();
    return lower.endsWith(".xlsx") || lower.endsWith(".xls");
  }, [file]);

  const loadDatasets = async () => {
    if (!namespace) return;
    setLoading(true);
    setError(null);
    try {
      const response = await backendFetch(
        `/api/data-center/datasets?namespace=${encodeURIComponent(namespace)}`
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to load datasets");
      }
      const data = (await response.json()) as DatasetRecord[];
      setDatasets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load datasets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDatasets();
  }, [namespace]);

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
        throw new Error(detail || "Upload failed");
      }

      setFile(null);
      setDatasetName("");
      setSheetName("");
      setSheetIndex("");
      setHeaderRow("");
      setMaxRows("");
      await loadDatasets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
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
        throw new Error(detail || "Failed to preview dataset");
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
      setError(err instanceof Error ? err.message : "Preview failed");
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

  return (
    <div className="px-6 py-6">
      <div className="flex items-center gap-3">
        <Database className="h-6 w-6 text-slate-200" />
        <h1 className="text-2xl font-semibold text-white">Data Center</h1>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Upload datasets and normalize Excel/CSV/JSON files into a reusable
        dataset registry.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <UploadCloud className="h-4 w-4" />
            <span>User Uploads</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Upload Excel, CSV, or JSON. Customize sheet and header settings for
            Excel files.
          </p>

          <div className="mt-4 space-y-3 text-sm text-slate-200">
            <div>
              <label className="text-xs text-slate-400">Dataset name</label>
              <input
                value={datasetName}
                onChange={(event) => setDatasetName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white"
                placeholder="Optional display name"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">File</label>
              <input
                type="file"
                accept=".json,.csv,.xlsx,.xls"
                onChange={(event) =>
                  setFile(event.target.files?.[0] ?? null)
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-slate-200"
              />
            </div>

            <div className={cn("grid gap-3 md:grid-cols-2", !isExcel && "opacity-60")}>
              <div>
                <label className="text-xs text-slate-400">Sheet name</label>
                <input
                  value={sheetName}
                  onChange={(event) => setSheetName(event.target.value)}
                  disabled={!isExcel}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white disabled:text-slate-500"
                  placeholder="Default: first sheet"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Sheet index</label>
                <input
                  value={sheetIndex}
                  onChange={(event) => setSheetIndex(event.target.value)}
                  disabled={!isExcel}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white disabled:text-slate-500"
                  placeholder="0-based index"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Header row</label>
                <input
                  value={headerRow}
                  onChange={(event) => setHeaderRow(event.target.value)}
                  disabled={!isExcel}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white disabled:text-slate-500"
                  placeholder="Default: 0"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Max rows</label>
                <input
                  value={maxRows}
                  onChange={(event) => setMaxRows(event.target.value)}
                  disabled={!isExcel}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white disabled:text-slate-500"
                  placeholder="Optional limit"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!file || !namespace || uploading}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Upload Dataset
            </button>
            {error ? <div className="text-xs text-rose-300">{error}</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <FileText className="h-4 w-4" />
            <span>Pipeline Outputs</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Generated datasets from pipelines will appear here.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/5 bg-white/5 p-5">
        <div className="flex items-center gap-2 text-sm text-slate-200">
          <Table2 className="h-4 w-4" />
          <span>Datasets</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-200">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Source</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Rows</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Preview</th>
                <th className="py-2 pr-4">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-4 text-slate-400">
                    Loading datasets...
                  </td>
                </tr>
              ) : datasets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-slate-400">
                    No datasets yet.
                  </td>
                </tr>
              ) : (
                datasets.map((dataset) => (
                  <tr key={dataset.id} className="border-t border-white/5">
                    <td className="py-3 pr-4">{dataset.name}</td>
                    <td className="py-3 pr-4">{dataset.source}</td>
                    <td className="py-3 pr-4">{dataset.ingest_status}</td>
                    <td className="py-3 pr-4">{dataset.row_count ?? "-"}</td>
                    <td className="py-3 pr-4">
                      {formatTimestamp(dataset.created_at)}
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        onClick={() => void openPreview(dataset)}
                        className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200 hover:border-white/20 hover:bg-white/10"
                      >
                        Preview
                      </button>
                    </td>
                    <td className="py-3 pr-4">
                      <Link
                        href={`/console/data-center/${dataset.id}`}
                        className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200 hover:border-white/20 hover:bg-white/10"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Preview: {previewDatasetName || "Dataset"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Total rows: {previewTotal}</span>
              <span>Showing: {previewItems.length}</span>
              {previewSampleMode ? <span>Sample mode</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200 hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
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
                Previous
              </button>
              <button
                type="button"
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200 hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
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
                Next
              </button>
              <button
                type="button"
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200 hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
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
                Random Sample
              </button>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-slate-100">
              {previewLoading ? (
                <div className="flex items-center gap-2 text-slate-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading preview...
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
    </div>
  );
}
