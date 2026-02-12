"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Database,
  Loader2,
  Play,
  Plus,
  Search,
  Settings,
  Tag,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ModelRegistryEntry } from "@/lib/model-registry";
import { getBackendUrl } from "@/lib/api-config";
import { backendFetch } from "@/lib/backendFetch";
import { getStoredAuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

type ModelFormState = {
  name: string;
  modelId: string;
  protocol: ModelRegistryEntry["protocol"];
  apiKey: string;
  baseUrl: string;
  description: string;
  tags: string[];
  status: ModelRegistryEntry["status"];
  temperature: string;
  topP: string;
  maxTokens: string;
};

const protocolLabels: Record<ModelRegistryEntry["protocol"], string> = {
  openai: "OpenAI",
  "openai-compatible": "OpenAI 兼容",
  azure: "Azure OpenAI",
};

const statusLabels: Record<ModelRegistryEntry["status"], string> = {
  active: "可用",
  inactive: "停用",
};

const commonPrompts = [
  "你好，请介绍一下你自己",
  "请解释一下人工智能的基本概念",
  "写一个简单的 Python Hello World 程序",
];

const surfaceCardClass =
  "rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur";

const createEmptyForm = (): ModelFormState => ({
  name: "",
  modelId: "",
  protocol: "openai",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  description: "",
  tags: [],
  status: "active",
  temperature: "",
  topP: "",
  maxTokens: "",
});

type BackendModelRecord = {
  id: string;
  name: string;
  model_id: string;
  protocol: ModelRegistryEntry["protocol"];
  api_key: string;
  base_url: string;
  description: string;
  tags: string[];
  status: ModelRegistryEntry["status"];
  params?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  } | null;
  created_at: number;
  updated_at: number;
};

export default function ModelRegistryPage() {
  const { toast } = useToast();
  const backendUrl = useMemo(() => getBackendUrl(), []);
  const [models, setModels] = useState<ModelRegistryEntry[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [search, setSearch] = useState("");
  const [protocolFilter, setProtocolFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelRegistryEntry | null>(
    null
  );
  const [formState, setFormState] = useState<ModelFormState>(createEmptyForm);
  const [tagInput, setTagInput] = useState("");

  const [testOpen, setTestOpen] = useState(false);
  const [testModel, setTestModel] = useState<ModelRegistryEntry | null>(null);
  const [testPrompt, setTestPrompt] = useState(commonPrompts[0]);
  const [testResult, setTestResult] = useState("");
  const [testError, setTestError] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const response = await backendFetch(
        `${backendUrl}/models${isAdmin ? "?include_inactive=true" : ""}`
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "加载模型失败");
      }
      const data = (await response.json()) as BackendModelRecord[];
      const mapped = data.map((item) => ({
        id: item.id,
        name: item.name,
        modelId: item.model_id,
        protocol: item.protocol,
        apiKey: item.api_key,
        baseUrl: item.base_url,
        description: item.description || "",
        tags: item.tags || [],
        status: item.status || "active",
        params: {
          temperature: item.params?.temperature,
          top_p: item.params?.top_p,
          max_tokens: item.params?.max_tokens,
        },
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })) as ModelRegistryEntry[];
      setModels(mapped);
    } catch (error) {
      setModels([]);
      toast({
        variant: "destructive",
        title: "模型加载失败",
        description: error instanceof Error ? error.message : "模型加载失败",
      });
    } finally {
      setModelsLoading(false);
    }
  }, [backendUrl, isAdmin, toast]);

  useEffect(() => {
    const user = getStoredAuthUser();
    setIsAdmin(user?.platform_role === "platform_admin");
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (!formOpen) {
      setFormState(createEmptyForm());
      setEditingModel(null);
      setTagInput("");
    }
  }, [formOpen]);

  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      const matchesSearch =
        !search ||
        model.name.toLowerCase().includes(search.toLowerCase()) ||
        model.modelId.toLowerCase().includes(search.toLowerCase()) ||
        model.tags.some((tag) =>
          tag.toLowerCase().includes(search.toLowerCase())
        );
      const matchesProtocol =
        protocolFilter === "all" || model.protocol === protocolFilter;
      const matchesStatus =
        statusFilter === "all" || model.status === statusFilter;
      return matchesSearch && matchesProtocol && matchesStatus;
    });
  }, [models, protocolFilter, search, statusFilter]);

  const openCreateDialog = () => {
    setFormState(createEmptyForm());
    setEditingModel(null);
    setFormOpen(true);
  };

  const openEditDialog = (model: ModelRegistryEntry) => {
    setEditingModel(model);
    setFormState({
      name: model.name,
      modelId: model.modelId,
      protocol: model.protocol,
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      description: model.description,
      tags: model.tags,
      status: model.status,
      temperature: model.params?.temperature?.toString() || "",
      topP: model.params?.top_p?.toString() || "",
      maxTokens: model.params?.max_tokens?.toString() || "",
    });
    setFormOpen(true);
  };

  const handleAddTag = () => {
    const value = tagInput.trim();
    if (!value) return;
    if (formState.tags.includes(value)) {
      setTagInput("");
      return;
    }
    setFormState((prev) => ({
      ...prev,
      tags: [...prev.tags, value],
    }));
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setFormState((prev) => ({
      ...prev,
      tags: prev.tags.filter((item) => item !== tag),
    }));
  };

  const handleProtocolChange = (value: ModelRegistryEntry["protocol"]) => {
    setFormState((prev) => ({
      ...prev,
      protocol: value,
      baseUrl:
        value === "openai" || value === "openai-compatible"
          ? "https://api.openai.com/v1"
          : prev.baseUrl,
    }));
  };

  const handleSave = async () => {
    if (!isAdmin) return;
    if (!formState.name.trim() || !formState.modelId.trim()) {
      toast({
        title: "请补充必填信息",
        description: "模型名称与模型 ID 为必填项。",
        variant: "destructive",
      });
      return;
    }
    if (!formState.apiKey.trim()) {
      toast({
        title: "请填写 API 密钥",
        description: "API 密钥用于模型测试与调用。",
        variant: "destructive",
      });
      return;
    }
    if (!formState.baseUrl.trim()) {
      toast({
        title: "请填写基础服务地址",
        description: "需要指定模型 API 的基础地址。",
        variant: "destructive",
      });
      return;
    }

    const parseNumber = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const payload = {
      id: editingModel?.id ?? null,
      name: formState.name.trim(),
      model_id: formState.modelId.trim(),
      protocol: formState.protocol,
      api_key: formState.apiKey.trim(),
      base_url: formState.baseUrl.trim(),
      description: formState.description.trim(),
      tags: formState.tags,
      status: formState.status,
      params: {
        temperature:
          formState.temperature.trim() === ""
            ? undefined
            : parseNumber(formState.temperature),
        top_p:
          formState.topP.trim() === "" ? undefined : parseNumber(formState.topP),
        max_tokens:
          formState.maxTokens.trim() === ""
            ? undefined
            : parseNumber(formState.maxTokens),
      },
    };

    setSaveLoading(true);
    try {
      const response = await backendFetch(
        editingModel
          ? `${backendUrl}/models/${editingModel.id}`
          : `${backendUrl}/models`,
        {
          method: editingModel ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "模型保存失败");
      }
      setFormOpen(false);
      await loadModels();
      toast({
        title: editingModel ? "模型已更新" : "模型已添加",
        description: "模型配置已保存到平台。",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "保存失败",
        description: error instanceof Error ? error.message : "模型保存失败",
      });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async (model: ModelRegistryEntry) => {
    if (!isAdmin) return;
    try {
      const response = await backendFetch(`${backendUrl}/models/${model.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "模型删除失败");
      }
      await loadModels();
      toast({
        title: "模型已删除",
        description: `已删除 ${model.name}。`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "删除失败",
        description: error instanceof Error ? error.message : "模型删除失败",
      });
    }
  };

  const openTestDialog = (model: ModelRegistryEntry) => {
    setTestModel(model);
    setTestPrompt(commonPrompts[0]);
    setTestResult("");
    setTestError(null);
    setTestOpen(true);
  };

  const handleRunTest = async () => {
    if (!testModel) return;
    setTestLoading(true);
    setTestError(null);
    setTestResult("");
    try {
      const response = await fetch("/api/model-registry/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: testModel.baseUrl,
          apiKey: testModel.apiKey,
          modelId: testModel.modelId,
          prompt: testPrompt,
          protocol: testModel.protocol,
        }),
      });
      const data = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error || "模型测试失败");
      }
      setTestResult(data.text || "");
    } catch (error) {
      setTestError(
        error instanceof Error ? error.message : "模型测试失败"
      );
    } finally {
      setTestLoading(false);
    }
  };

  const maskedKey = (key: string) => {
    if (!key) return "-";
    if (key.length <= 6) return "******";
    return `${key.slice(0, 3)}...${key.slice(-3)}`;
  };

  const formatTime = (value: number) => new Date(value * 1000).toLocaleString();
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
            <Database className="h-5 w-5 text-blue-600" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">模型资源池</h1>
            <p className="mt-1 text-sm text-slate-500">
              统一管理可用模型、协议参数与联调测试。
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <Button
              onClick={openCreateDialog}
              className="h-10 rounded-lg bg-blue-600 px-4 text-white hover:bg-blue-500"
            >
              <Plus className="mr-2 h-4 w-4" />
              添加模型
            </Button>
          ) : null}
        </div>
      </section>

      <section
        className={cn(
          surfaceCardClass,
          "bg-gradient-to-r from-white via-slate-50/70 to-white p-4"
        )}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_160px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索模型名称 / ID / 标签"
              className="h-11 rounded-lg border-slate-200 bg-white pl-9 text-slate-700"
            />
          </div>
          <Select value={protocolFilter} onValueChange={setProtocolFilter}>
            <SelectTrigger className="h-11 rounded-lg border-slate-200 bg-white text-slate-700">
              <SelectValue placeholder="所有协议" />
            </SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
              <SelectItem value="all">所有协议</SelectItem>
              {Object.entries(protocolLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 rounded-lg border-slate-200 bg-white text-slate-700">
              <SelectValue placeholder="所有状态" />
            </SelectTrigger>
            <SelectContent className="border-slate-200 bg-white text-slate-900">
              <SelectItem value="all">所有状态</SelectItem>
              {Object.entries(statusLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className={cn(surfaceCardClass, "overflow-hidden bg-white")}>
        <div className="border-b border-slate-200/80 bg-gradient-to-r from-white to-slate-50/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Database className="h-4 w-4" />
              <span>模型列表</span>
              <Badge variant="outline" className="border-slate-300 text-slate-600">
                {filteredModels.length} 条
              </Badge>
            </div>
            <div className="text-xs text-slate-500">
              API 密钥仅展示掩码（{maskedKey("example_key")}）
            </div>
          </div>
        </div>
        <div className="overflow-x-auto p-2">
          <Table>
            <TableHeader className="bg-gradient-to-r from-slate-50 to-white">
              <TableRow className="border-slate-200">
                <TableHead className="text-slate-600">模型</TableHead>
                <TableHead className="text-slate-600">协议与地址</TableHead>
                <TableHead className="text-slate-600">状态</TableHead>
                <TableHead className="text-slate-600">更新时间</TableHead>
                <TableHead className="text-right text-slate-600">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modelsLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      模型加载中...
                    </span>
                  </TableCell>
                </TableRow>
              ) : filteredModels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                    {models.length === 0
                      ? "暂无模型配置，点击右上角添加。"
                      : "没有匹配的模型。"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredModels.map((model) => {
                  const canTest =
                    model.protocol === "openai" || model.protocol === "openai-compatible";
                  return (
                    <TableRow
                      key={model.id}
                      className="border-slate-200 transition-colors hover:bg-slate-50/70"
                    >
                      <TableCell>
                        <div className="font-medium text-slate-800">{model.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-slate-500">
                          {model.modelId}
                        </div>
                        {model.tags.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {model.tags.map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="border-slate-300 bg-white text-[11px] text-slate-600"
                              >
                                <Tag className="mr-1 h-3 w-3" />
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="border-slate-300 bg-white text-slate-700"
                        >
                          {protocolLabels[model.protocol]}
                        </Badge>
                        <div className="mt-2 text-xs text-slate-500">{model.baseUrl}</div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            model.status === "active"
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                              : "bg-slate-200 text-slate-700 hover:bg-slate-200"
                          )}
                        >
                          {statusLabels[model.status]}
                        </Badge>
                        <div className="mt-2 text-xs text-slate-500">
                          密钥 {maskedKey(model.apiKey)}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        <div>{formatTime(model.updatedAt)}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          创建 {formatTime(model.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-md border-slate-200 text-slate-700 hover:bg-slate-50"
                            onClick={() => openTestDialog(model)}
                            disabled={!canTest}
                          >
                            <Play className="mr-1.5 h-3.5 w-3.5" />
                            测试
                          </Button>
                          {isAdmin ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-md border-slate-200 text-slate-700 hover:bg-slate-50"
                                onClick={() => openEditDialog(model)}
                              >
                                <Settings className="mr-1.5 h-3.5 w-3.5" />
                                编辑
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-md border-rose-200 text-rose-600 hover:bg-rose-50"
                                onClick={() => handleDelete(model)}
                              >
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                删除
                              </Button>
                            </>
                          ) : null}
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

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto border-slate-200 bg-white p-0">
          <DialogHeader className="border-b border-slate-200/80 bg-gradient-to-r from-white to-slate-50/70 px-5 py-4">
            <DialogTitle className="text-base font-semibold text-slate-900">
              {editingModel ? "编辑模型" : "添加新模型"}
            </DialogTitle>
            <p className="text-xs text-slate-500">
              维护模型连接信息、参数默认值与可见状态。
            </p>
          </DialogHeader>

          <div className="space-y-4 p-5">
            <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div>
                <div className="text-sm font-medium text-slate-800">基础配置</div>
                <div className="text-xs text-slate-500">模型标识与接入地址</div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">模型名称</Label>
                  <Input
                    value={formState.name}
                    onChange={(event) =>
                      setFormState((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="例如：通用大模型 v3"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">API 协议</Label>
                  <Select
                    value={formState.protocol}
                    onValueChange={(value) =>
                      handleProtocolChange(value as ModelRegistryEntry["protocol"])
                    }
                  >
                    <SelectTrigger className={fieldClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-slate-200 bg-white text-slate-900">
                      {Object.entries(protocolLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">模型 ID</Label>
                  <Input
                    value={formState.modelId}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        modelId: event.target.value,
                      }))
                    }
                    placeholder="例如：gpt-4o-mini"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">API 密钥</Label>
                  <Input
                    type="password"
                    value={formState.apiKey}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        apiKey: event.target.value,
                      }))
                    }
                    placeholder="sk-****"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="text-xs text-slate-500">基础服务地址</Label>
                  <Input
                    value={formState.baseUrl}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        baseUrl: event.target.value,
                      }))
                    }
                    placeholder="https://api.openai.com/v1"
                    className={fieldClass}
                  />
                  <p className="text-xs text-slate-500">
                    API 密钥仅保存在浏览器本地，刷新或清理缓存后需重新配置。
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <div className="text-sm font-medium text-slate-800">描述与标签</div>
                <div className="text-xs text-slate-500">方便在模型选择时快速识别用途</div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">标签</Label>
                <div className="flex flex-wrap gap-2">
                  {formState.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      <Tag className="h-3 w-3" />
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 text-[10px]"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    placeholder="输入标签后回车"
                    className="h-10 rounded-lg border-slate-200 bg-white text-slate-700"
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddTag();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50"
                    onClick={handleAddTag}
                  >
                    添加
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">描述</Label>
                <Textarea
                  value={formState.description}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  placeholder="填写模型用途说明"
                  className="min-h-[96px] rounded-lg border-slate-200 bg-white text-slate-700"
                />
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              <div>
                <div className="text-sm font-medium text-slate-800">参数默认值</div>
                <div className="text-xs text-slate-500">可选参数，不填则按服务默认配置</div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">Temperature</Label>
                  <Input
                    value={formState.temperature}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        temperature: event.target.value,
                      }))
                    }
                    placeholder="0.2"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">Top P</Label>
                  <Input
                    value={formState.topP}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        topP: event.target.value,
                      }))
                    }
                    placeholder="0.9"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">Max Tokens</Label>
                  <Input
                    value={formState.maxTokens}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        maxTokens: event.target.value,
                      }))
                    }
                    placeholder="2048"
                    className={fieldClass}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                <div>
                  <div className="text-sm font-medium text-slate-700">启用模型</div>
                  <div className="text-xs text-slate-500">
                    关闭后模型不会出现在选择列表中。
                  </div>
                </div>
                <Switch
                  checked={formState.status === "active"}
                  onCheckedChange={(checked) =>
                    setFormState((prev) => ({
                      ...prev,
                      status: checked ? "active" : "inactive",
                    }))
                  }
                />
              </div>
            </section>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                onClick={() => setFormOpen(false)}
                className="h-10 rounded-lg text-slate-600 hover:bg-slate-100"
              >
                取消
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveLoading}
                className="h-10 rounded-lg bg-blue-600 px-4 text-white hover:bg-blue-500"
              >
                {saveLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    保存中
                  </>
                ) : (
                  "保存模型"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto border-slate-200 bg-white p-0">
          <DialogHeader className="border-b border-slate-200/80 bg-gradient-to-r from-white to-slate-50/70 px-5 py-4">
            <DialogTitle className="text-base font-semibold text-slate-900">
              测试模型：{testModel?.name || "-"}
            </DialogTitle>
            <p className="text-xs text-slate-500">
              发送一段提示词，快速验证模型连通性与返回质量。
            </p>
          </DialogHeader>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              {commonPrompts.map((prompt) => (
                <Button
                  key={prompt}
                  size="sm"
                  variant={prompt === testPrompt ? "default" : "outline"}
                  className={
                    prompt === testPrompt
                      ? "bg-blue-600 text-white hover:bg-blue-500"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }
                  onClick={() => setTestPrompt(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">测试提示词</Label>
              <Textarea
                value={testPrompt}
                onChange={(event) => setTestPrompt(event.target.value)}
                rows={4}
                className="rounded-lg border-slate-200 bg-white text-slate-700"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleRunTest}
                disabled={testLoading}
                className="h-10 rounded-lg bg-blue-600 px-4 text-white hover:bg-blue-500"
              >
                {testLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    测试中
                  </>
                ) : (
                  "开始测试"
                )}
              </Button>
              <Button
                variant="outline"
                className="h-10 rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50"
                onClick={() => setTestOpen(false)}
                disabled={testLoading}
              >
                关闭
              </Button>
            </div>
            {testError ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-600">
                {testError}
              </div>
            ) : null}
            <div className="min-h-[160px] rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="mb-2 text-xs text-slate-500">模型响应</div>
              <div className="whitespace-pre-wrap text-sm text-slate-700">
                {testResult || "等待模型返回结果..."}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
