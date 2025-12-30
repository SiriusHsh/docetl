"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
} from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
import { getBackendUrl } from "@/lib/api-config";
import { readNamespace, subscribeToNamespaceChanges } from "@/lib/namespace";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ScheduleType = "cron" | "interval" | "once";

type DeploymentRecord = {
  id: string;
  namespace: string;
  name: string;
  pipeline_id: string;
  enabled: boolean;
  schedule_type: ScheduleType;
  schedule: Record<string, unknown>;
  timezone: string;
  input_dataset_id?: string | null;
  output_to_data_center: boolean;
  output_dataset_name_tpl?: string | null;
  misfire_policy: "skip" | "run_once" | "catch_up";
  max_catchup_runs?: number | null;
  last_run_id?: string | null;
  next_run_at?: number | null;
  created_at: number;
  updated_at: number;
};

type PipelineRecord = {
  id: string;
  name: string;
};

type DatasetRecord = {
  id: string;
  name: string;
  source: string;
  format: string;
  ingest_status: string;
  row_count?: number | null;
};

const scheduleTypeLabels: Record<ScheduleType, string> = {
  cron: "Cron",
  interval: "Interval",
  once: "Once",
};

const formatTimestamp = (value?: number | null) => {
  if (!value) return "-";
  return new Date(value * 1000).toLocaleString();
};

const formatSchedule = (deployment: DeploymentRecord) => {
  const schedule = deployment.schedule || {};
  if (deployment.schedule_type === "cron") {
    return `Cron: ${schedule.cron || "-"}`;
  }
  if (deployment.schedule_type === "interval") {
    return `Every ${schedule.every || "-"} ${schedule.unit || ""}`;
  }
  if (deployment.schedule_type === "once") {
    return `Once: ${schedule.run_at || "-"}`;
  }
  return "-";
};

export default function DeploymentsPage() {
  const { toast } = useToast();
  const backendUrl = useMemo(() => getBackendUrl(), []);
  const [namespace, setNamespace] = useState<string | null>(null);

  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [pipelines, setPipelines] = useState<PipelineRecord[]>([]);
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDeployment, setEditingDeployment] =
    useState<DeploymentRecord | null>(null);

  const [formName, setFormName] = useState("");
  const [formPipelineId, setFormPipelineId] = useState("");
  const [formScheduleType, setFormScheduleType] =
    useState<ScheduleType>("interval");
  const [formCron, setFormCron] = useState("0 9 * * *");
  const [formIntervalEvery, setFormIntervalEvery] = useState("15");
  const [formIntervalUnit, setFormIntervalUnit] = useState("minutes");
  const [formRunAt, setFormRunAt] = useState("");
  const [formTimezone, setFormTimezone] = useState("Asia/Shanghai");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formInputDatasetId, setFormInputDatasetId] = useState("none");
  const [formOutputToDataCenter, setFormOutputToDataCenter] = useState(false);
  const [formOutputTemplate, setFormOutputTemplate] = useState("");

  useEffect(() => {
    setNamespace(readNamespace());
    return subscribeToNamespaceChanges((next) => {
      setNamespace(next);
    });
  }, []);

  const loadDeployments = useCallback(async () => {
    if (!namespace) return;
    setLoading(true);
    try {
      const response = await backendFetch(
        `${backendUrl}/deployments?namespace=${encodeURIComponent(namespace)}`
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as DeploymentRecord[];
      setDeployments(data);
    } catch (err) {
      toast({
        title: "Failed to load deployments",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [backendUrl, namespace, toast]);

  const loadPipelines = useCallback(async () => {
    if (!namespace) return;
    const response = await backendFetch(
      `${backendUrl}/pipelines?namespace=${encodeURIComponent(namespace)}`
    );
    if (!response.ok) return;
    const data = (await response.json()) as PipelineRecord[];
    setPipelines(data);
  }, [backendUrl, namespace]);

  const loadDatasets = useCallback(async () => {
    if (!namespace) return;
    const response = await backendFetch(
      `/api/data-center/datasets?namespace=${encodeURIComponent(namespace)}`
    );
    if (!response.ok) return;
    const data = (await response.json()) as DatasetRecord[];
    const ready = data.filter((item) => item.ingest_status === "ready");
    setDatasets(ready);
  }, [namespace]);

  useEffect(() => {
    if (!namespace) return;
    void loadDeployments();
    void loadPipelines();
    void loadDatasets();
  }, [namespace, loadDatasets, loadDeployments, loadPipelines]);

  const openCreateDialog = () => {
    setEditingDeployment(null);
    setFormName("");
    setFormPipelineId(pipelines[0]?.id || "");
    setFormScheduleType("interval");
    setFormCron("0 9 * * *");
    setFormIntervalEvery("15");
    setFormIntervalUnit("minutes");
    setFormRunAt("");
    setFormTimezone("Asia/Shanghai");
    setFormEnabled(true);
    setFormInputDatasetId("none");
    setFormOutputToDataCenter(false);
    setFormOutputTemplate("");
    setDialogOpen(true);
  };

  const openEditDialog = (deployment: DeploymentRecord) => {
    setEditingDeployment(deployment);
    setFormName(deployment.name);
    setFormPipelineId(deployment.pipeline_id);
    setFormScheduleType(deployment.schedule_type);
    setFormCron(String(deployment.schedule?.cron || ""));
    setFormIntervalEvery(String(deployment.schedule?.every || "15"));
    setFormIntervalUnit(String(deployment.schedule?.unit || "minutes"));
    setFormRunAt(String(deployment.schedule?.run_at || ""));
    setFormTimezone(deployment.timezone || "Asia/Shanghai");
    setFormEnabled(deployment.enabled);
    setFormInputDatasetId(deployment.input_dataset_id || "none");
    setFormOutputToDataCenter(deployment.output_to_data_center);
    setFormOutputTemplate(deployment.output_dataset_name_tpl || "");
    setDialogOpen(true);
  };

  const buildSchedule = () => {
    if (formScheduleType === "cron") {
      return { cron: formCron.trim() };
    }
    if (formScheduleType === "once") {
      return { run_at: formRunAt };
    }
    return {
      every: Number(formIntervalEvery || 0),
      unit: formIntervalUnit,
    };
  };

  const handleSave = async () => {
    if (!namespace) return;
    if (!formName.trim() || !formPipelineId) {
      toast({
        title: "Missing fields",
        description: "Deployment name and pipeline are required.",
        variant: "destructive",
      });
      return;
    }
    const payload = {
      namespace,
      name: formName.trim(),
      pipeline_id: formPipelineId,
      enabled: formEnabled,
      schedule_type: formScheduleType,
      schedule: buildSchedule(),
      timezone: formTimezone.trim() || "Asia/Shanghai",
      input_dataset_id: formInputDatasetId !== "none" ? formInputDatasetId : null,
      output_to_data_center: formOutputToDataCenter,
      output_dataset_name_tpl: formOutputTemplate.trim() || null,
    };
    setSaving(true);
    try {
      const response = await backendFetch(
        `${backendUrl}/deployments${editingDeployment ? `/${editingDeployment.id}` : ""}`,
        {
          method: editingDeployment ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      toast({ title: "Deployment saved" });
      setDialogOpen(false);
      await loadDeployments();
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (deployment: DeploymentRecord) => {
    if (!namespace) return;
    try {
      const response = await backendFetch(
        `${backendUrl}/deployments/${deployment.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            namespace,
            enabled: !deployment.enabled,
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await loadDeployments();
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleTrigger = async (deployment: DeploymentRecord) => {
    try {
      const response = await backendFetch(
        `${backendUrl}/deployments/${deployment.id}/trigger`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(await response.text());
      }
      toast({ title: "Run triggered" });
    } catch (err) {
      toast({
        title: "Trigger failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (deployment: DeploymentRecord) => {
    if (!window.confirm(`Delete deployment "${deployment.name}"?`)) return;
    try {
      const response = await backendFetch(
        `${backendUrl}/deployments/${deployment.id}`,
        { method: "DELETE" }
      );
      if (!response.ok && response.status !== 204) {
        throw new Error(await response.text());
      }
      toast({ title: "Deployment deleted" });
      await loadDeployments();
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <CalendarClock className="h-6 w-6 text-slate-200" />
            <h1 className="text-2xl font-semibold text-white">Deployments</h1>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Schedule pipelines to run automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-slate-700 text-slate-200 hover:bg-slate-800"
            onClick={() => void loadDeployments()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button
            type="button"
            onClick={openCreateDialog}
            className="bg-blue-600 hover:bg-blue-500"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Deployment
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#151921]">
        {loading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading deployments...
          </div>
        ) : deployments.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">
            No deployments yet. Create one to schedule a pipeline.
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-[#11141c]">
              <TableRow className="border-slate-800">
                <TableHead className="text-slate-300">Deployment</TableHead>
                <TableHead className="text-slate-300">Schedule</TableHead>
                <TableHead className="text-slate-300">Next Run</TableHead>
                <TableHead className="text-slate-300">Last Run</TableHead>
                <TableHead className="text-slate-300">Status</TableHead>
                <TableHead className="text-slate-300 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map((deployment) => (
                <TableRow key={deployment.id} className="border-slate-800">
                  <TableCell>
                    <div className="text-sm text-slate-100 font-medium">
                      {deployment.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      Pipeline {deployment.pipeline_id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-200">
                      {scheduleTypeLabels[deployment.schedule_type]}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatSchedule(deployment)}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-300">
                    {deployment.next_run_at
                      ? formatTimestamp(deployment.next_run_at)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {deployment.last_run_id ? (
                      <Link
                        href={`/console/runs/${deployment.last_run_id}`}
                        className="text-xs text-blue-300 hover:text-blue-200"
                      >
                        {deployment.last_run_id.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={deployment.enabled}
                        onCheckedChange={() => void handleToggleEnabled(deployment)}
                      />
                      <span
                        className={cn(
                          "text-xs",
                          deployment.enabled ? "text-emerald-400" : "text-slate-500"
                        )}
                      >
                        {deployment.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-700 text-slate-200 hover:bg-slate-800"
                        onClick={() => handleTrigger(deployment)}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        Run
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-700 text-slate-200 hover:bg-slate-800"
                        onClick={() => openEditDialog(deployment)}
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                        onClick={() => handleDelete(deployment)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#151921] border border-slate-800 text-slate-100 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-100">
              {editingDeployment ? "Edit Deployment" : "Create Deployment"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Name</Label>
                <Input
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  className="bg-[#0f1116] border-slate-800 text-slate-200"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Pipeline</Label>
                <Select value={formPipelineId} onValueChange={setFormPipelineId}>
                  <SelectTrigger className="bg-[#0f1116] border-slate-800 text-slate-200">
                    <SelectValue placeholder="Select pipeline" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#151921] border-slate-800 text-slate-100">
                    {pipelines.map((pipeline) => (
                      <SelectItem key={pipeline.id} value={pipeline.id}>
                        {pipeline.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Schedule Type</Label>
                <Select
                  value={formScheduleType}
                  onValueChange={(value) => setFormScheduleType(value as ScheduleType)}
                >
                  <SelectTrigger className="bg-[#0f1116] border-slate-800 text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#151921] border-slate-800 text-slate-100">
                    {Object.entries(scheduleTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Timezone</Label>
                <Input
                  value={formTimezone}
                  onChange={(event) => setFormTimezone(event.target.value)}
                  className="bg-[#0f1116] border-slate-800 text-slate-200"
                />
              </div>
            </div>

            {formScheduleType === "cron" ? (
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Cron Expression</Label>
                <Input
                  value={formCron}
                  onChange={(event) => setFormCron(event.target.value)}
                  placeholder="0 9 * * *"
                  className="bg-[#0f1116] border-slate-800 text-slate-200"
                />
              </div>
            ) : null}

            {formScheduleType === "interval" ? (
              <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Every</Label>
                  <Input
                    value={formIntervalEvery}
                    onChange={(event) => setFormIntervalEvery(event.target.value)}
                    className="bg-[#0f1116] border-slate-800 text-slate-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Unit</Label>
                  <Select
                    value={formIntervalUnit}
                    onValueChange={setFormIntervalUnit}
                  >
                    <SelectTrigger className="bg-[#0f1116] border-slate-800 text-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#151921] border-slate-800 text-slate-100">
                      <SelectItem value="seconds">Seconds</SelectItem>
                      <SelectItem value="minutes">Minutes</SelectItem>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="days">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            {formScheduleType === "once" ? (
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Run At (local time)</Label>
                <Input
                  type="datetime-local"
                  value={formRunAt}
                  onChange={(event) => setFormRunAt(event.target.value)}
                  className="bg-[#0f1116] border-slate-800 text-slate-200"
                />
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Input Dataset</Label>
                <Select
                  value={formInputDatasetId}
                  onValueChange={setFormInputDatasetId}
                >
                  <SelectTrigger className="bg-[#0f1116] border-slate-800 text-slate-200">
                    <SelectValue placeholder="Use pipeline default" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#151921] border-slate-800 text-slate-100">
                    <SelectItem value="none">Use pipeline default</SelectItem>
                    {datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Enabled</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formEnabled}
                    onCheckedChange={setFormEnabled}
                  />
                  <span className="text-xs text-slate-400">
                    {formEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-[#0f1116] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-400">Data Center Output</div>
                <Switch
                  checked={formOutputToDataCenter}
                  onCheckedChange={setFormOutputToDataCenter}
                />
              </div>
              {formOutputToDataCenter ? (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">
                    Output Dataset Name Template (optional)
                  </Label>
                  <Input
                    value={formOutputTemplate}
                    onChange={(event) => setFormOutputTemplate(event.target.value)}
                    placeholder="{{pipeline_name}}_{{date}}"
                    className="bg-[#0f1116] border-slate-800 text-slate-200"
                  />
                </div>
              ) : null}
            </div>

            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-blue-600 hover:bg-blue-500"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {editingDeployment ? "Save Changes" : "Create Deployment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
