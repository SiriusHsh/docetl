"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Loader2,
  RefreshCw,
  Square,
} from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
import { getBackendUrl } from "@/lib/api-config";
import { readNamespace, subscribeToNamespaceChanges } from "@/lib/namespace";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
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

type PipelineRecord = {
  id: string;
  name: string;
};

const STATUS_OPTIONS: Array<{ value: RunStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const formatTimestamp = (value?: number | null) => {
  if (!value) return "-";
  return new Date(value * 1000).toLocaleString();
};

const formatDuration = (run: RunRecord) => {
  if (!run.started_at) return "-";
  const end = run.ended_at ? run.ended_at * 1000 : Date.now();
  const seconds = Math.max(0, Math.round((end - run.started_at * 1000) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

const formatCost = (value?: number | null) => {
  if (value == null) return "-";
  return `$${value.toFixed(4)}`;
};

const statusLabelMap: Record<RunStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const statusClassMap: Record<RunStatus, string> = {
  pending: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  running: "bg-sky-500/10 text-sky-300 border-sky-500/30",
  completed: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/10 text-red-300 border-red-500/30",
  cancelled: "bg-slate-500/10 text-slate-400 border-slate-500/30",
};

export default function RunsPage() {
  const { toast } = useToast();
  const backendUrl = useMemo(() => getBackendUrl(), []);
  const [namespace, setNamespace] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RunStatus | "all">("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    setNamespace(readNamespace());
    return subscribeToNamespaceChanges((next) => {
      setNamespace(next);
    });
  }, []);

  const loadPipelines = useCallback(async () => {
    if (!namespace) return;
    try {
      const response = await backendFetch(
        `${backendUrl}/pipelines?namespace=${encodeURIComponent(namespace)}`
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to load pipelines");
      }
      const data = (await response.json()) as PipelineRecord[];
      setPipelines(data);
    } catch (err) {
      toast({
        title: "Failed to load pipelines",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }, [backendUrl, namespace, toast]);

  const loadRuns = useCallback(async () => {
    if (!namespace) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ namespace });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (pipelineFilter !== "all") params.set("pipeline_id", pipelineFilter);
      const response = await backendFetch(`${backendUrl}/runs?${params.toString()}`);
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to load runs");
      }
      const data = (await response.json()) as RunRecord[];
      setRuns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, namespace, pipelineFilter, statusFilter]);

  useEffect(() => {
    if (!namespace) return;
    void loadRuns();
  }, [namespace, loadRuns]);

  useEffect(() => {
    if (!namespace) return;
    void loadPipelines();
  }, [namespace, loadPipelines]);

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
    const confirmed = window.confirm("Cancel this run?");
    if (!confirmed) return;
    setPendingActions((prev) => ({ ...prev, [runId]: true }));
    try {
      const response = await backendFetch(`${backendUrl}/runs/${runId}/cancel`, {
        method: "POST",
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Failed to cancel run");
      }
      toast({ title: "Cancellation requested" });
      await loadRuns();
    } catch (err) {
      toast({
        title: "Cancel failed",
        description: err instanceof Error ? err.message : "Failed to cancel run",
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
          <h1 className="text-2xl font-semibold text-white">Runs</h1>
          <p className="mt-2 text-sm text-slate-400">
            Track pipeline executions and manage run lifecycle.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-slate-700 text-slate-200 hover:bg-slate-800"
          onClick={() => void loadRuns()}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#151921] p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[180px_240px_1fr]">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as RunStatus | "all")}
          >
            <SelectTrigger className="bg-[#0f1116] border-slate-800 text-slate-200">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-[#151921] border-slate-800 text-slate-100">
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
            <SelectTrigger className="bg-[#0f1116] border-slate-800 text-slate-200">
              <SelectValue placeholder="Pipeline" />
            </SelectTrigger>
            <SelectContent className="bg-[#151921] border-slate-800 text-slate-100">
              <SelectItem value="all">All pipelines</SelectItem>
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
            placeholder="Search by run id, pipeline, trigger"
            className="bg-[#0f1116] border-slate-800 text-slate-200"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#151921]">
        {error ? (
          <div className="p-6 text-sm text-red-400">{error}</div>
        ) : loading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading runs...
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">
            No runs found for the current filters.
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-[#11141c]">
              <TableRow className="border-slate-800">
                <TableHead className="text-slate-300">Run</TableHead>
                <TableHead className="text-slate-300">Pipeline</TableHead>
                <TableHead className="text-slate-300">Status</TableHead>
                <TableHead className="text-slate-300">Trigger</TableHead>
                <TableHead className="text-slate-300">Started</TableHead>
                <TableHead className="text-slate-300">Duration</TableHead>
                <TableHead className="text-slate-300">Cost</TableHead>
                <TableHead className="text-slate-300 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRuns.map((run) => {
                const canCancel = run.status === "running" || run.status === "pending";
                const isPending = pendingActions[run.id];
                return (
                  <TableRow key={run.id} className="border-slate-800">
                    <TableCell>
                      <div className="text-sm text-slate-200 font-medium">
                        {run.id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatTimestamp(run.created_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-slate-200">
                        {run.pipeline_name || "Untitled pipeline"}
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
                    <TableCell className="text-sm text-slate-300">
                      {run.trigger || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-slate-300">
                      {formatTimestamp(run.started_at)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-300">
                      {formatDuration(run)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-300">
                      {formatCost(run.cost)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canCancel ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                            onClick={() => void handleCancel(run.id)}
                            disabled={Boolean(isPending)}
                          >
                            {isPending ? (
                              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Square className="mr-2 h-3.5 w-3.5" />
                            )}
                            Cancel
                          </Button>
                        ) : null}
                        <Link
                          href={`/console/runs/${run.id}`}
                          className="inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
                        >
                          View
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

      {!namespace ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Set a namespace to view runs.
        </div>
      ) : null}
    </div>
  );
}
