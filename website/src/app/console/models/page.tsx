"use client";

import { useEffect, useMemo, useState } from "react";
import {
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
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  ModelRegistryEntry,
  generateModelId,
  deleteModel,
  upsertModel,
} from "@/lib/model-registry";
import { useModelRegistry } from "@/hooks/useModelRegistry";

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

export default function ModelRegistryPage() {
  const { toast } = useToast();
  const { namespace, models } = useModelRegistry();

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

  const handleSave = () => {
    if (!namespace) {
      toast({
        title: "缺少工作区",
        description: "请先选择工作区后再保存模型。",
        variant: "destructive",
      });
      return;
    }
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

    const now = Date.now();
    const parseNumber = (value: string) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    const entry: ModelRegistryEntry = {
      id: editingModel?.id ?? generateModelId(),
      name: formState.name.trim(),
      modelId: formState.modelId.trim(),
      protocol: formState.protocol,
      apiKey: formState.apiKey.trim(),
      baseUrl: formState.baseUrl.trim(),
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
      createdAt: editingModel?.createdAt ?? now,
      updatedAt: now,
    };

    upsertModel(namespace, entry);
    setFormOpen(false);
    toast({
      title: editingModel ? "模型已更新" : "模型已添加",
      description: "模型配置已保存到本地浏览器。",
    });
  };

  const handleDelete = (model: ModelRegistryEntry) => {
    if (!namespace) return;
    deleteModel(namespace, model.id);
    toast({
      title: "模型已删除",
      description: `已删除 ${model.name}。`,
    });
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

  return (
    <div className="px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">模型配置中心</h1>
          <p className="mt-1 text-sm text-slate-500">
            统一管理工作区可用的大模型配置，并用于模型选择与测试。
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2" disabled={!namespace}>
          <Plus className="h-4 w-4" />
          添加模型
        </Button>
      </div>
      {!namespace ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          请先在右上角选择工作区后再配置模型。
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索模型名称 / ID / 标签"
              className="pl-9"
            />
          </div>
          <Select value={protocolFilter} onValueChange={setProtocolFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="所有协议" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有协议</SelectItem>
              {Object.entries(protocolLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="所有状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有状态</SelectItem>
              {Object.entries(statusLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1.4fr_1.2fr_0.8fr_0.6fr_0.8fr] bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
            <div>模型名称</div>
            <div>模型 ID</div>
            <div>API 协议</div>
            <div>状态</div>
            <div className="text-right">操作</div>
          </div>
          {filteredModels.length === 0 ? (
            <div className="px-4 py-10 text-sm text-slate-500 text-center">
              {models.length === 0
                ? "暂无模型配置，点击右上角添加。"
                : "没有匹配的模型。"}
            </div>
          ) : (
            filteredModels.map((model) => (
              <div
                key={model.id}
                className="grid grid-cols-[1.4fr_1.2fr_0.8fr_0.6fr_0.8fr] items-center px-4 py-3 border-t border-slate-100 text-sm"
              >
                <div>
                  <div className="font-medium text-slate-900">{model.name}</div>
                  {model.tags.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {model.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="text-slate-600 font-mono text-xs">
                  <div>{model.modelId}</div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {maskedKey(model.apiKey)}
                  </div>
                </div>
                <div className="text-slate-600">{protocolLabels[model.protocol]}</div>
                <div>
                  <Badge
                    variant={model.status === "active" ? "default" : "secondary"}
                  >
                    {statusLabels[model.status]}
                  </Badge>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openTestDialog(model)}
                    disabled={
                      model.protocol !== "openai" &&
                      model.protocol !== "openai-compatible"
                    }
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEditDialog(model)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(model)}
                  >
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingModel ? "编辑模型" : "添加新模型"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>模型名称</Label>
              <Input
                value={formState.name}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="例如：通用大模型 v3"
              />
            </div>
            <div className="space-y-2">
              <Label>API 协议</Label>
              <Select
                value={formState.protocol}
                onValueChange={(value) =>
                  handleProtocolChange(value as ModelRegistryEntry["protocol"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(protocolLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>模型 ID</Label>
              <Input
                value={formState.modelId}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    modelId: event.target.value,
                  }))
                }
                placeholder="例如：gpt-4o-mini"
              />
            </div>
            <div className="space-y-2">
              <Label>API 密钥</Label>
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
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>基础服务地址</Label>
              <Input
                value={formState.baseUrl}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    baseUrl: event.target.value,
                  }))
                }
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-xs text-slate-400">
                API 密钥仅保存在浏览器本地，刷新或清理缓存后需重新配置。
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>标签</Label>
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
              <div className="flex items-center gap-2">
                <Input
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  placeholder="输入标签后回车"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddTag();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={handleAddTag}>
                  添加
                </Button>
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>描述</Label>
              <Textarea
                value={formState.description}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                placeholder="填写模型用途说明"
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
              <div className="text-sm font-medium text-slate-700">
                模型参数配置
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-xs">Temperature</Label>
                  <Input
                    value={formState.temperature}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        temperature: event.target.value,
                      }))
                    }
                    placeholder="0.2"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Top P</Label>
                  <Input
                    value={formState.topP}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        topP: event.target.value,
                      }))
                    }
                    placeholder="0.9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Max Tokens</Label>
                  <Input
                    value={formState.maxTokens}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        maxTokens: event.target.value,
                      }))
                    }
                    placeholder="2048"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 md:col-span-2">
              <div>
                <div className="text-sm font-medium text-slate-700">启用模型</div>
                <div className="text-xs text-slate-400">
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
          </div>

          <DialogFooter className="mt-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>保存模型</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              测试模型：{testModel?.name || "-"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {commonPrompts.map((prompt) => (
                <Button
                  key={prompt}
                  size="sm"
                  variant={prompt === testPrompt ? "default" : "outline"}
                  onClick={() => setTestPrompt(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label>测试提示词</Label>
              <Textarea
                value={testPrompt}
                onChange={(event) => setTestPrompt(event.target.value)}
                rows={4}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleRunTest} disabled={testLoading}>
                {testLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    测试中
                  </>
                ) : (
                  "开始测试"
                )}
              </Button>
              <Button
                variant="ghost"
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
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 min-h-[140px]">
              <div className="text-xs text-slate-500 mb-2">模型响应</div>
              <div className="text-sm text-slate-700 whitespace-pre-wrap">
                {testResult || "等待模型返回结果..."}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
