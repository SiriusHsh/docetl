"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Database,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Trash2,
} from "lucide-react";

import { backendFetch } from "@/lib/backendFetch";
import { getBackendUrl } from "@/lib/api-config";
import { readNamespace } from "@/lib/namespace";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
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
  retry_policy?: {
    max_attempts?: number;
    backoff_seconds?: number;
    backoff_multiplier?: number;
    max_backoff_seconds?: number;
    notify_on_each_failure?: boolean;
    notify_on_final_failure?: boolean;
    notify_webhook_url?: string | null;
  } | null;
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
  cron: "定时表达式",
  interval: "间隔",
  once: "单次",
};

const scheduleUnitLabels: Record<string, string> = {
  seconds: "秒",
  minutes: "分钟",
  hours: "小时",
  days: "天",
};

const surfaceCardClass =
  "rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur";

const formatTimestamp = (value?: number | null) => {
  if (!value) return "-";
  return new Date(value * 1000).toLocaleString();
};

const formatSchedule = (deployment: DeploymentRecord) => {
  const schedule = deployment.schedule || {};
  if (deployment.schedule_type === "cron") {
    return `定时表达式：${schedule.cron || "-"}`;
  }
  if (deployment.schedule_type === "interval") {
    const unitLabel = scheduleUnitLabels[String(schedule.unit || "")] || schedule.unit || "";
    return `每 ${schedule.every || "-"} ${unitLabel}`;
  }
  if (deployment.schedule_type === "once") {
    return `单次：${schedule.run_at || "-"}`;
  }
  return "-";
};

export default function DeploymentsPage() {
  const { toast } = useToast();
  const backendUrl = useMemo(() => getBackendUrl(), []);
  const namespace = readNamespace() || "public_business";

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
  const [formMaxAttempts, setFormMaxAttempts] = useState("1");
  const [formBackoffSeconds, setFormBackoffSeconds] = useState("30");
  const [formBackoffMultiplier, setFormBackoffMultiplier] = useState("2");
  const [formMaxBackoffSeconds, setFormMaxBackoffSeconds] = useState("3600");
  const [formNotifyOnFinalFailure, setFormNotifyOnFinalFailure] = useState(false);
  const [formNotifyWebhookUrl, setFormNotifyWebhookUrl] = useState("");
  const [search, setSearch] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [scheduleFilter, setScheduleFilter] = useState<"all" | ScheduleType>("all");

  const loadDeployments = useCallback(async () => {
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
        title: "加载部署失败",
        description: err instanceof Error ? err.message : "未知错误",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [backendUrl, namespace, toast]);

  const loadPipelines = useCallback(async () => {
    const response = await backendFetch(
      `${backendUrl}/pipelines?namespace=${encodeURIComponent(namespace)}`
    );
    if (!response.ok) return;
    const data = (await response.json()) as PipelineRecord[];
    setPipelines(data);
  }, [backendUrl, namespace]);

  const loadDatasets = useCallback(async () => {
    const response = await backendFetch(
      `/api/data-center/datasets?namespace=${encodeURIComponent(namespace)}`
    );
    if (!response.ok) return;
    const data = (await response.json()) as DatasetRecord[];
    const ready = data.filter((item) => item.ingest_status === "ready");
    setDatasets(ready);
  }, [namespace]);

  useEffect(() => {
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
    setFormMaxAttempts("1");
    setFormBackoffSeconds("30");
    setFormBackoffMultiplier("2");
    setFormMaxBackoffSeconds("3600");
    setFormNotifyOnFinalFailure(false);
    setFormNotifyWebhookUrl("");
    setDialogOpen(true);
  };

  const openEditDialog = (deployment: DeploymentRecord) => {
    setEditingDeployment(deployment);
    setFormName(deployment.name);
    setFormPipelineId(deployment.pipeline_id);
    const normalizedScheduleType =
      deployment.schedule_type === "cron" ? "interval" : deployment.schedule_type;
    setFormScheduleType(normalizedScheduleType);
    setFormCron(String(deployment.schedule?.cron || ""));
    setFormIntervalEvery(String(deployment.schedule?.every || "15"));
    setFormIntervalUnit(String(deployment.schedule?.unit || "minutes"));
    setFormRunAt(String(deployment.schedule?.run_at || ""));
    setFormTimezone(deployment.timezone || "Asia/Shanghai");
    setFormEnabled(deployment.enabled);
    setFormInputDatasetId(deployment.input_dataset_id || "none");
    setFormOutputToDataCenter(deployment.output_to_data_center);
    setFormOutputTemplate(deployment.output_dataset_name_tpl || "");
    setFormMaxAttempts(
      String(deployment.retry_policy?.max_attempts ?? 1)
    );
    setFormBackoffSeconds(
      String(deployment.retry_policy?.backoff_seconds ?? 30)
    );
    setFormBackoffMultiplier(
      String(deployment.retry_policy?.backoff_multiplier ?? 2)
    );
    setFormMaxBackoffSeconds(
      String(deployment.retry_policy?.max_backoff_seconds ?? 3600)
    );
    setFormNotifyOnFinalFailure(
      Boolean(deployment.retry_policy?.notify_on_final_failure)
    );
    setFormNotifyWebhookUrl(deployment.retry_policy?.notify_webhook_url || "");
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

  const buildRetryPolicy = () => {
    const maxAttempts = Math.max(1, Number(formMaxAttempts || 1));
    const hasNotifications =
      formNotifyOnFinalFailure || Boolean(formNotifyWebhookUrl.trim());
    if (maxAttempts <= 1 && !hasNotifications) {
      return null;
    }
    return {
      max_attempts: maxAttempts,
      backoff_seconds: Math.max(0, Number(formBackoffSeconds || 0)),
      backoff_multiplier: Math.max(1, Number(formBackoffMultiplier || 1)),
      max_backoff_seconds: Math.max(0, Number(formMaxBackoffSeconds || 0)),
      notify_on_final_failure: formNotifyOnFinalFailure,
      notify_webhook_url: formNotifyWebhookUrl.trim() || null,
    };
  };

  const handleSave = async () => {
    if (!namespace) return;
    if (!formName.trim() || !formPipelineId) {
      toast({
        title: "缺少必填项",
        description: "需要填写部署名称与流水线。",
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
      retry_policy: buildRetryPolicy(),
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
      toast({ title: "部署已保存" });
      setDialogOpen(false);
      await loadDeployments();
    } catch (err) {
      toast({
        title: "保存失败",
        description: err instanceof Error ? err.message : "未知错误",
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
        title: "更新失败",
        description: err instanceof Error ? err.message : "未知错误",
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
      toast({ title: "已触发运行" });
    } catch (err) {
      toast({
        title: "触发失败",
        description: err instanceof Error ? err.message : "未知错误",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (deployment: DeploymentRecord) => {
    if (!window.confirm(`确认删除部署“${deployment.name}”吗？`)) return;
    try {
      const response = await backendFetch(
        `${backendUrl}/deployments/${deployment.id}`,
        { method: "DELETE" }
      );
      if (!response.ok && response.status !== 204) {
        throw new Error(await response.text());
      }
      toast({ title: "部署已删除" });
      await loadDeployments();
    } catch (err) {
      toast({
        title: "删除失败",
        description: err instanceof Error ? err.message : "未知错误",
        variant: "destructive",
      });
    }
  };

  const enabledCount = useMemo(
    () => deployments.filter((deployment) => deployment.enabled).length,
    [deployments]
  );
  const nextRunCount = useMemo(
    () => deployments.filter((deployment) => Boolean(deployment.next_run_at)).length,
    [deployments]
  );
  const outputToDataCenterCount = useMemo(
    () => deployments.filter((deployment) => deployment.output_to_data_center).length,
    [deployments]
  );
  const pipelineNameById = useMemo(
    () => new Map(pipelines.map((pipeline) => [pipeline.id, pipeline.name])),
    [pipelines]
  );
  const filteredDeployments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return deployments.filter((deployment) => {
      const matchesEnabled =
        enabledFilter === "all" ||
        (enabledFilter === "enabled" && deployment.enabled) ||
        (enabledFilter === "disabled" && !deployment.enabled);
      const matchesSchedule =
        scheduleFilter === "all" || deployment.schedule_type === scheduleFilter;
      if (!matchesEnabled || !matchesSchedule) return false;
      if (!query) return true;

      const pipelineName = pipelineNameById.get(deployment.pipeline_id) || "";
      return (
        deployment.name.toLowerCase().includes(query) ||
        deployment.pipeline_id.toLowerCase().includes(query) ||
        pipelineName.toLowerCase().includes(query)
      );
    });
  }, [deployments, enabledFilter, pipelineNameById, scheduleFilter, search]);

  const fieldClass = "h-10 rounded-lg border-slate-200 bg-white text-slate-700";

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
            <CalendarClock className="h-5 w-5 text-blue-600" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">部署</h1>
            <p className="mt-1 text-sm text-slate-500">
              配置自动调度策略，让流水线持续稳定运行。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-lg border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => void loadDeployments()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            刷新
          </Button>
          <Button
            type="button"
            onClick={openCreateDialog}
            className="h-10 rounded-lg bg-blue-600 px-4 text-white hover:bg-blue-500"
          >
            <Plus className="mr-2 h-4 w-4" />
            新建部署
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">部署总数</span>
            <Database className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-3 text-4xl font-semibold leading-none text-slate-900">
            {deployments.length}
          </div>
          <div className="mt-2 text-xs text-slate-500">当前命名空间已登记部署</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/60 to-white p-4 shadow-sm shadow-emerald-100/70">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">启用中</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-3 text-4xl font-semibold leading-none text-slate-900">
            {enabledCount}
          </div>
          <div className="mt-2 text-xs text-slate-500">正在参与调度的部署</div>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-gradient-to-b from-blue-50/60 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">已设置下次运行</span>
            <Activity className="h-4 w-4 text-blue-600" />
          </div>
          <div className="mt-3 text-4xl font-semibold leading-none text-slate-900">
            {nextRunCount}
          </div>
          <div className="mt-2 text-xs text-slate-500">具备明确触发时间</div>
        </div>
        <div className="rounded-2xl border border-indigo-200 bg-gradient-to-b from-indigo-50/60 to-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">输出到数据货架</span>
            <Database className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="mt-3 text-4xl font-semibold leading-none text-slate-900">
            {outputToDataCenterCount}
          </div>
          <div className="mt-2 text-xs text-slate-500">自动沉淀数据资产</div>
        </div>
      </section>

      <section
        className={cn(
          surfaceCardClass,
          "bg-gradient-to-r from-white via-slate-50/70 to-white p-4"
        )}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_180px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索部署名称 / 流水线 ID"
              className="h-11 rounded-lg border-slate-200 bg-white pl-9 text-slate-700"
            />
          </div>
          <Select
            value={enabledFilter}
            onValueChange={(value) =>
              setEnabledFilter(value as "all" | "enabled" | "disabled")
            }
          >
            <SelectTrigger className="h-11 rounded-lg border-slate-200 bg-white text-slate-700">
              <SelectValue placeholder="状态筛选" />
            </SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="enabled">已启用</SelectItem>
              <SelectItem value="disabled">已停用</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={scheduleFilter}
            onValueChange={(value) => setScheduleFilter(value as "all" | ScheduleType)}
          >
            <SelectTrigger className="h-11 rounded-lg border-slate-200 bg-white text-slate-700">
              <SelectValue placeholder="调度类型" />
            </SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
              <SelectItem value="all">全部调度</SelectItem>
              <SelectItem value="interval">间隔</SelectItem>
              <SelectItem value="once">单次</SelectItem>
              <SelectItem value="cron">定时表达式</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className={cn(surfaceCardClass, "overflow-hidden bg-white")}>
        <div className="border-b border-slate-200/80 bg-gradient-to-r from-white to-slate-50/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <CalendarClock className="h-4 w-4" />
              <span>部署列表</span>
              <Badge variant="outline" className="border-slate-300 text-slate-600">
                {filteredDeployments.length} 条
              </Badge>
            </div>
            <div className="text-xs text-slate-500">命名空间：{namespace}</div>
          </div>
        </div>
        <div className="overflow-x-auto p-2">
          <Table>
            <TableHeader className="bg-gradient-to-r from-slate-50 to-white">
              <TableRow className="border-slate-200">
                <TableHead className="text-slate-600">部署</TableHead>
                <TableHead className="text-slate-600">调度</TableHead>
                <TableHead className="text-slate-600">下次运行</TableHead>
                <TableHead className="text-slate-600">上次运行</TableHead>
                <TableHead className="text-slate-600">状态</TableHead>
                <TableHead className="text-right text-slate-600">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在加载部署...
                    </span>
                  </TableCell>
                </TableRow>
              ) : filteredDeployments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-slate-500">
                    暂无匹配部署，可创建后自动调度流水线。
                  </TableCell>
                </TableRow>
              ) : (
                filteredDeployments.map((deployment) => {
                  const pipelineName =
                    pipelineNameById.get(deployment.pipeline_id) || deployment.pipeline_id;
                  return (
                    <TableRow
                      key={deployment.id}
                      className="border-slate-200 transition-colors hover:bg-slate-50/70"
                    >
                      <TableCell>
                        <div className="font-medium text-slate-800">{deployment.name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          流水线：{pipelineName}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Badge
                            variant="outline"
                            className="border-slate-300 bg-white text-slate-600"
                          >
                            {scheduleTypeLabels[deployment.schedule_type]}
                          </Badge>
                          {deployment.output_to_data_center ? (
                            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                              输出到数据货架
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-slate-700">{formatSchedule(deployment)}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          时区：{deployment.timezone || "Asia/Shanghai"}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {deployment.next_run_at
                          ? formatTimestamp(deployment.next_run_at)
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {deployment.last_run_id ? (
                          <Link
                            href={`/console/runs/${deployment.last_run_id}`}
                            className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-100"
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
                              "text-xs font-medium",
                              deployment.enabled ? "text-emerald-600" : "text-slate-500"
                            )}
                          >
                            {deployment.enabled ? "启用" : "停用"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-md border-slate-200 text-slate-700 hover:bg-slate-50"
                            onClick={() => handleTrigger(deployment)}
                          >
                            <Play className="mr-1.5 h-3.5 w-3.5" />
                            运行
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-md border-slate-200 text-slate-700 hover:bg-slate-50"
                            onClick={() => openEditDialog(deployment)}
                          >
                            <Settings className="mr-1.5 h-3.5 w-3.5" />
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-md border-rose-200 text-rose-600 hover:bg-rose-50"
                            onClick={() => handleDelete(deployment)}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            删除
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto border-slate-200 bg-white p-0">
          <DialogHeader className="border-b border-slate-200/80 bg-gradient-to-r from-white to-slate-50/70 px-5 py-4">
            <DialogTitle className="text-base font-semibold text-slate-900">
              {editingDeployment ? "编辑部署" : "创建部署"}
            </DialogTitle>
            <p className="text-xs text-slate-500">
              设置调度策略、数据输入和失败重试方式。
            </p>
          </DialogHeader>
          <div className="space-y-4 p-5">
            <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-800">基本信息</div>
                  <div className="text-xs text-slate-500">部署标识与流水线关联</div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
                  <span className="text-xs text-slate-600">启用部署</span>
                  <Switch checked={formEnabled} onCheckedChange={setFormEnabled} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">部署名称</Label>
                  <Input
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                    placeholder="例如：日间同步任务"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">流水线</Label>
                  <Select value={formPipelineId} onValueChange={setFormPipelineId}>
                    <SelectTrigger className={fieldClass}>
                      <SelectValue placeholder="选择流水线" />
                    </SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white text-slate-900">
                      {pipelines.map((pipeline) => (
                        <SelectItem key={pipeline.id} value={pipeline.id}>
                          {pipeline.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs text-slate-500">时区</Label>
                  <Input
                    value={formTimezone}
                    onChange={(event) => setFormTimezone(event.target.value)}
                    placeholder="Asia/Shanghai"
                    className={fieldClass}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <div className="text-sm font-medium text-slate-800">调度策略</div>
                <div className="text-xs text-slate-500">定义部署触发节奏</div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs text-slate-500">调度类型</Label>
                  <Select
                    value={formScheduleType}
                    onValueChange={(value) => setFormScheduleType(value as ScheduleType)}
                  >
                    <SelectTrigger className={fieldClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white text-slate-900">
                      {Object.entries(scheduleTypeLabels)
                        .filter(([value]) => value !== "cron")
                        .map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {formScheduleType === "cron" ? (
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-xs text-slate-500">定时表达式</Label>
                    <Input
                      value={formCron}
                      onChange={(event) => setFormCron(event.target.value)}
                      placeholder="0 9 * * *"
                      className={fieldClass}
                    />
                  </div>
                ) : null}
                {formScheduleType === "interval" ? (
                  <>
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-500">间隔</Label>
                      <Input
                        value={formIntervalEvery}
                        onChange={(event) => setFormIntervalEvery(event.target.value)}
                        className={fieldClass}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-slate-500">单位</Label>
                      <Select value={formIntervalUnit} onValueChange={setFormIntervalUnit}>
                        <SelectTrigger className={fieldClass}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-slate-200 bg-white text-slate-900">
                          <SelectItem value="seconds">秒</SelectItem>
                          <SelectItem value="minutes">分钟</SelectItem>
                          <SelectItem value="hours">小时</SelectItem>
                          <SelectItem value="days">天</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : null}
                {formScheduleType === "once" ? (
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-xs text-slate-500">运行时间（本地）</Label>
                    <Input
                      type="datetime-local"
                      value={formRunAt}
                      onChange={(event) => setFormRunAt(event.target.value)}
                      className={fieldClass}
                    />
                  </div>
                ) : null}
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <div className="text-sm font-medium text-slate-800">数据输入与输出</div>
                <div className="text-xs text-slate-500">可选绑定输入数据集并产出到数据货架</div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">输入数据集</Label>
                <Select
                  value={formInputDatasetId}
                  onValueChange={setFormInputDatasetId}
                >
                  <SelectTrigger className={fieldClass}>
                    <SelectValue placeholder="使用流水线默认" />
                  </SelectTrigger>
                  <SelectContent className="border-slate-200 bg-white text-slate-900">
                    <SelectItem value="none">使用流水线默认</SelectItem>
                    {datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-600">输出到数据货架</Label>
                  <Switch
                    checked={formOutputToDataCenter}
                    onCheckedChange={setFormOutputToDataCenter}
                  />
                </div>
                {formOutputToDataCenter ? (
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">
                      输出数据集名称模板（可选）
                    </Label>
                    <Input
                      value={formOutputTemplate}
                      onChange={(event) => setFormOutputTemplate(event.target.value)}
                      placeholder="{{pipeline_name}}_{{date}}"
                      className={fieldClass}
                    />
                  </div>
                ) : null}
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <div className="text-sm font-medium text-slate-800">失败重试策略</div>
                <div className="text-xs text-slate-500">提升任务稳定性与可恢复能力</div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">最大重试次数</Label>
                  <Input
                    value={formMaxAttempts}
                    onChange={(event) => setFormMaxAttempts(event.target.value)}
                    type="number"
                    inputMode="numeric"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">初始回退秒数</Label>
                  <Input
                    value={formBackoffSeconds}
                    onChange={(event) => setFormBackoffSeconds(event.target.value)}
                    type="number"
                    inputMode="numeric"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">回退倍率</Label>
                  <Input
                    value={formBackoffMultiplier}
                    onChange={(event) => setFormBackoffMultiplier(event.target.value)}
                    type="number"
                    inputMode="decimal"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">最大回退秒数</Label>
                  <Input
                    value={formMaxBackoffSeconds}
                    onChange={(event) => setFormMaxBackoffSeconds(event.target.value)}
                    type="number"
                    inputMode="numeric"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2 md:col-span-2 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-slate-600">最终失败时通知</Label>
                    <Switch
                      checked={formNotifyOnFinalFailure}
                      onCheckedChange={setFormNotifyOnFinalFailure}
                    />
                  </div>
                  <Input
                    value={formNotifyWebhookUrl}
                    onChange={(event) => setFormNotifyWebhookUrl(event.target.value)}
                    placeholder="可选 Webhook URL"
                    className={fieldClass}
                  />
                </div>
              </div>
            </section>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                className="h-10 rounded-lg text-slate-600 hover:bg-slate-100"
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="h-10 rounded-lg bg-blue-600 px-4 text-white hover:bg-blue-500"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {editingDeployment ? "保存更改" : "创建部署"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
