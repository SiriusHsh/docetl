"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Database, Loader2, GitBranch, Table2 } from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
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
  const datasetId = Array.isArray(params.datasetId)
    ? params.datasetId[0]
    : params.datasetId;
  const [dataset, setDataset] = useState<DatasetRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

    const fetchDataset = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await backendFetch(
          `/api/data-center/datasets/${datasetId}`
        );
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(detail || "Failed to load dataset");
        }
        const data = (await response.json()) as DatasetRecord;
        if (isMounted) {
          setDataset(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to load dataset");
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
    };
  }, [datasetId]);

  const formatTimestamp = (value?: number | null) =>
    value ? new Date(value * 1000).toLocaleString() : "-";

  const lineage = useMemo(() => {
    if (!dataset?.lineage) return null;
    return dataset.lineage;
  }, [dataset]);

  const hasLineage = lineage && Object.keys(lineage).length > 0;

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

  const openPreview = async () => {
    setPreviewItems([]);
    setPreviewOffset(0);
    setPreviewLimit(20);
    setPreviewTotal(0);
    setPreviewSampleMode(false);
    setPreviewOpen(true);
    await fetchPreview({ offset: 0, limit: 20 });
  };

  return (
    <div className="px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/console/data-center"
            className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-200 hover:border-white/20 hover:bg-white/10"
          >
            Back
          </Link>
          <Database className="h-6 w-6 text-slate-200" />
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {dataset?.name || "Dataset"}
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              {dataset?.source || "Data Center"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void openPreview()}
          className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-200 hover:border-white/20 hover:bg-white/10 disabled:opacity-50"
          disabled={!datasetId}
        >
          Preview
        </button>
      </div>

      {loading ? (
        <div className="mt-8 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading dataset...
        </div>
      ) : error ? (
        <div className="mt-8 text-sm text-rose-300">{error}</div>
      ) : dataset ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
            <div className="flex items-center gap-2 text-sm text-slate-200">
              <Table2 className="h-4 w-4" />
              <span>Dataset Overview</span>
            </div>
            <div className="mt-4 grid gap-4 text-sm text-slate-200 sm:grid-cols-2">
              <div>
                <div className="text-xs text-slate-400">Status</div>
                <div className="mt-1">{dataset.ingest_status}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Rows</div>
                <div className="mt-1">{dataset.row_count ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Format</div>
                <div className="mt-1">
                  {dataset.format}
                  {dataset.original_format
                    ? ` (${dataset.original_format})`
                    : ""}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Created</div>
                <div className="mt-1">{formatTimestamp(dataset.created_at)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Updated</div>
                <div className="mt-1">{formatTimestamp(dataset.updated_at)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Dataset ID</div>
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
              <span>Lineage</span>
            </div>
            <div className="mt-4 text-sm text-slate-200">
              {hasLineage ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="text-xs text-slate-400">Pipeline</div>
                      <div className="mt-1">
                        {(typeof lineage?.pipeline_name === "string" &&
                          lineage?.pipeline_name) ||
                          (typeof lineage?.pipeline_id === "string" &&
                            lineage?.pipeline_id) ||
                          "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Run ID</div>
                      <div className="mt-1">
                        {(typeof lineage?.run_id === "string" &&
                          lineage?.run_id) ||
                          "-"}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <div className="text-xs text-slate-400">Output Path</div>
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
                  No lineage recorded for this dataset.
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
              Preview: {dataset?.name || "Dataset"}
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
                disabled={previewLoading || previewOffset <= 0 || previewSampleMode}
                onClick={() =>
                  fetchPreview({
                    offset: Math.max(previewOffset - previewLimit, 0),
                    limit: previewLimit,
                  })
                }
              >
                Previous
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
                Next
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
