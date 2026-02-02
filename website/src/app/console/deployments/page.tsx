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
import { readNamespace } from "@/lib/namespace";
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
  const namespace = readNamespace() || "default";

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

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <CalendarClock className="h-6 w-6 text-slate-600" />
            <h1 className="text-2xl font-semibold text-slate-900">部署</h1>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            配置流水线自动运行。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-slate-200 text-slate-600 hover:bg-slate-50"
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
            className="bg-blue-600 hover:bg-blue-500"
          >
            <Plus className="mr-2 h-4 w-4" />
            新建部署
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在加载部署...
          </div>
        ) : deployments.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            暂无部署，可创建后自动调度流水线。
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="border-slate-200">
                <TableHead className="text-slate-600">部署</TableHead>
                <TableHead className="text-slate-600">调度</TableHead>
                <TableHead className="text-slate-600">下次运行</TableHead>
                <TableHead className="text-slate-600">上次运行</TableHead>
                <TableHead className="text-slate-600">状态</TableHead>
                <TableHead className="text-slate-600 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deployments.map((deployment) => (
                <TableRow key={deployment.id} className="border-slate-200">
                  <TableCell>
                    <div className="text-sm text-slate-900 font-medium">
                      {deployment.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      流水线 {deployment.pipeline_id}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-700">
                      {scheduleTypeLabels[deployment.schedule_type]}
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatSchedule(deployment)}
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
                        className="text-xs text-blue-600 hover:text-blue-700"
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
                        className="border-slate-200 text-slate-600 hover:bg-slate-50"
                        onClick={() => handleTrigger(deployment)}
                      >
                        <Play className="mr-2 h-4 w-4" />
                        运行
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-200 text-slate-600 hover:bg-slate-50"
                        onClick={() => openEditDialog(deployment)}
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-200 text-rose-600 hover:bg-rose-50"
                        onClick={() => handleDelete(deployment)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        删除
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
        <DialogContent className="bg-white border border-slate-200 text-slate-900 max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-900">
              {editingDeployment ? "编辑部署" : "创建部署"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">名称</Label>
                <Input
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  className="bg-white border-slate-200 text-slate-700"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">流水线</Label>
                <Select value={formPipelineId} onValueChange={setFormPipelineId}>
                  <SelectTrigger className="bg-white border-slate-200 text-slate-700">
                    <SelectValue placeholder="选择流水线" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-700">
                    {pipelines.map((pipeline) => (
                      <SelectItem key={pipeline.id} value={pipeline.id}>
                        {pipeline.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">调度类型</Label>
                <Select
                  value={formScheduleType}
                  onValueChange={(value) => setFormScheduleType(value as ScheduleType)}
                >
                  <SelectTrigger className="bg-white border-slate-200 text-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-700">
                    {Object.entries(scheduleTypeLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">时区</Label>
                <Input
                  value={formTimezone}
                  onChange={(event) => setFormTimezone(event.target.value)}
                  className="bg-white border-slate-200 text-slate-700"
                />
              </div>
            </div>

            {formScheduleType === "cron" ? (
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">定时表达式</Label>
                <Input
                  value={formCron}
                  onChange={(event) => setFormCron(event.target.value)}
                  placeholder="0 9 * * *"
                  className="bg-white border-slate-200 text-slate-700"
                />
              </div>
            ) : null}

            {formScheduleType === "interval" ? (
              <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">间隔</Label>
                  <Input
                    value={formIntervalEvery}
                    onChange={(event) => setFormIntervalEvery(event.target.value)}
                    className="bg-white border-slate-200 text-slate-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">单位</Label>
                  <Select
                    value={formIntervalUnit}
                    onValueChange={setFormIntervalUnit}
                  >
                    <SelectTrigger className="bg-white border-slate-200 text-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 text-slate-700">
                      <SelectItem value="seconds">秒</SelectItem>
                      <SelectItem value="minutes">分钟</SelectItem>
                      <SelectItem value="hours">小时</SelectItem>
                      <SelectItem value="days">天</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            {formScheduleType === "once" ? (
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">运行时间（本地）</Label>
                <Input
                  type="datetime-local"
                  value={formRunAt}
                  onChange={(event) => setFormRunAt(event.target.value)}
                  className="bg-white border-slate-200 text-slate-700"
                />
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">输入数据集</Label>
                <Select
                  value={formInputDatasetId}
                  onValueChange={setFormInputDatasetId}
                >
                  <SelectTrigger className="bg-white border-slate-200 text-slate-700">
                    <SelectValue placeholder="使用流水线默认" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 text-slate-700">
                    <SelectItem value="none">使用流水线默认</SelectItem>
                    {datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>
                        {dataset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">启用</Label>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formEnabled}
                    onCheckedChange={setFormEnabled}
                  />
                  <span className="text-xs text-slate-500">
                    {formEnabled ? "已启用" : "已停用"}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-500">输出到数据货架</div>
                <Switch
                  checked={formOutputToDataCenter}
                  onCheckedChange={setFormOutputToDataCenter}
                />
              </div>
              {formOutputToDataCenter ? (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">
                    输出数据集名称模板（可选）
                  </Label>
                  <Input
                    value={formOutputTemplate}
                    onChange={(event) => setFormOutputTemplate(event.target.value)}
                    placeholder="{{pipeline_name}}_{{date}}"
                    className="bg-white border-slate-200 text-slate-700"
                  />
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-500">重试策略</div>
                <span className="text-xs text-slate-500">
                  最大重试与退避
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">最大重试次数</Label>
                  <Input
                    type="number"
                    min={1}
                    value={formMaxAttempts}
                    onChange={(event) => setFormMaxAttempts(event.target.value)}
                    className="bg-white border-slate-200 text-slate-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">
                    退避秒数
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={formBackoffSeconds}
                    onChange={(event) => setFormBackoffSeconds(event.target.value)}
                    className="bg-white border-slate-200 text-slate-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">
                    退避倍率
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    step="0.1"
                    value={formBackoffMultiplier}
                    onChange={(event) => setFormBackoffMultiplier(event.target.value)}
                    className="bg-white border-slate-200 text-slate-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">
                    最大退避秒数
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={formMaxBackoffSeconds}
                    onChange={(event) => setFormMaxBackoffSeconds(event.target.value)}
                    className="bg-white border-slate-200 text-slate-700"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formNotifyOnFinalFailure}
                    onCheckedChange={setFormNotifyOnFinalFailure}
                  />
                  <span className="text-xs text-slate-500">
                    最终失败通知
                  </span>
                </div>
                <Input
                  value={formNotifyWebhookUrl}
                  onChange={(event) => setFormNotifyWebhookUrl(event.target.value)}
                  placeholder="回调地址（可选）"
                  className="bg-white border-slate-200 text-slate-700 md:max-w-sm"
                />
              </div>
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
              {editingDeployment ? "保存更改" : "创建部署"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
