import React, { useState, useMemo, useCallback } from "react";
import { File } from "@/app/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AlertCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import yaml from "js-yaml";
import { backendFetch } from "@/lib/backendFetch";
import { ModelInput } from "@/components/ModelInput";
import { useModelRegistry } from "@/hooks/useModelRegistry";

const PREDEFINED_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "claude-3-7-sonnet-20250219",
  "claude-3-opus-20240229",
  "azure/<your-deployment-name>",
  "gemini/gemini-2.0-flash",
] as const;

interface PipelineSettingsProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  namespace: string | null;
  pipelineName: string;
  setPipelineName: (name: string) => void;
  currentFile: File | null;
  setCurrentFile: (file: File | null) => void;
  defaultModel: string;
  setDefaultModel: (model: string) => void;
  optimizerModel: string;
  setOptimizerModel: (model: string) => void;
  autoOptimizeCheck: boolean;
  setAutoOptimizeCheck: (check: boolean) => void;
  files: File[];
  apiKeys: Array<{ name: string; value: string }>;
  extraPipelineSettings: Record<string, unknown> | null;
  setExtraPipelineSettings: (settings: Record<string, unknown> | null) => void;
  saveOutputToDataCenter: boolean;
  setSaveOutputToDataCenter: (value: boolean) => void;
}

type DataCenterDataset = {
  id: string;
  name: string;
  path: string;
  source: string;
  format: string;
  row_count?: number | null;
  created_at: number;
};

const SAMPLE_YAML = `# 示例配置 - 可删除或按需修改
rate_limits:
  llm_call:
    - count: 1000000
      per: 1
      unit: minute
  llm_tokens:
    - count: 1000000000
      per: 1
      unit: minute`;

const PipelineSettings: React.FC<PipelineSettingsProps> = ({
  isOpen,
  onOpenChange,
  namespace,
  pipelineName,
  setPipelineName,
  currentFile,
  setCurrentFile,
  defaultModel,
  setDefaultModel,
  optimizerModel,
  setOptimizerModel,
  autoOptimizeCheck,
  setAutoOptimizeCheck,
  files,
  apiKeys,
  extraPipelineSettings,
  setExtraPipelineSettings,
  saveOutputToDataCenter,
  setSaveOutputToDataCenter,
}) => {
  const [tempPipelineName, setTempPipelineName] = useState(pipelineName);
  const [tempCurrentFile, setTempCurrentFile] = useState<File | null>(
    currentFile
  );
  const [tempDefaultModel, setTempDefaultModel] = useState(defaultModel);
  const [tempOptimizerModel, setTempOptimizerModel] = useState(optimizerModel);
  const [tempAutoOptimizeCheck, setTempAutoOptimizeCheck] =
    useState(autoOptimizeCheck);
  const [tempSaveOutputToDataCenter, setTempSaveOutputToDataCenter] =
    useState(saveOutputToDataCenter);
  const [isLocalMode, setIsLocalMode] = useState(false);
  const [dataCenterDatasets, setDataCenterDatasets] = useState<
    DataCenterDataset[]
  >([]);
  const [dataCenterLoading, setDataCenterLoading] = useState(false);
  const [dataCenterError, setDataCenterError] = useState<string | null>(null);
  const { modelOptions } = useModelRegistry(namespace);

  // Convert extraPipelineSettings to YAML string
  const initialYamlString = useMemo(() => {
    if (!extraPipelineSettings) {
      return "";
    }
    try {
      return yaml.dump(extraPipelineSettings);
    } catch (e) {
      console.error("Error converting settings to YAML:", e);
      return "";
    }
  }, [extraPipelineSettings]);

  const [tempYamlSettings, setTempYamlSettings] = useState(initialYamlString);
  const [yamlError, setYamlError] = useState<string | null>(null);

  const hasOpenAIKey = useMemo(() => {
    return apiKeys.some((key) => key.name === "OPENAI_API_KEY");
  }, [apiKeys]);

  const defaultModelSuggestions = useMemo(() => {
    const predefined = PREDEFINED_MODELS.map((model) => ({
      value: model,
      label: model,
    }));
    const combined = [...modelOptions, ...predefined];
    const seen = new Set<string>();
    return combined.filter((item) => {
      if (seen.has(item.value)) {
        return false;
      }
      seen.add(item.value);
      return true;
    });
  }, [modelOptions]);

  const optimizerModelSuggestions = useMemo(() => {
    const preferred = ["gpt-4o", "gpt-4o-mini"].map((model) => ({
      value: model,
      label: model,
    }));
    const combined = [...modelOptions, ...preferred];
    const seen = new Set<string>();
    return combined.filter((item) => {
      if (seen.has(item.value)) {
        return false;
      }
      seen.add(item.value);
      return true;
    });
  }, [modelOptions]);

  const loadDataCenterDatasets = useCallback(async () => {
    if (!namespace) {
      setDataCenterDatasets([]);
      return;
    }
    setDataCenterLoading(true);
    setDataCenterError(null);
    try {
      const response = await backendFetch(
        `/api/data-center/datasets?namespace=${encodeURIComponent(namespace)}`
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "加载数据中心数据集失败");
      }
      const data = (await response.json()) as DataCenterDataset[];
      const normalized = data
        .filter((dataset) => dataset.format === "json")
        .sort((a, b) => b.created_at - a.created_at);
      setDataCenterDatasets(normalized);
    } catch (err) {
      setDataCenterDatasets([]);
      setDataCenterError(
        err instanceof Error
          ? err.message
          : "加载数据中心数据集失败"
      );
    } finally {
      setDataCenterLoading(false);
    }
  }, [namespace]);

  const workspaceOptions = useMemo(
    () =>
      files
        .filter((file) => file.type === "json")
        .map((file) => ({
          value: file.path,
          label: file.name,
          file,
          origin: "workspace" as const,
        })),
    [files]
  );

  const dataCenterOptions = useMemo(
    () =>
      dataCenterDatasets.map((dataset) => ({
        value: dataset.path,
        label: dataset.name,
        file: {
          name: dataset.name,
          path: dataset.path,
          type: "json" as const,
          parentFolder: "数据中心",
        },
        origin: "data-center" as const,
        source: dataset.source,
      })),
    [dataCenterDatasets]
  );

  const fallbackOption = useMemo(() => {
    if (!tempCurrentFile?.path) {
      return null;
    }
    const inWorkspace = workspaceOptions.some(
      (option) => option.value === tempCurrentFile.path
    );
    const inDataCenter = dataCenterOptions.some(
      (option) => option.value === tempCurrentFile.path
    );
    if (inWorkspace || inDataCenter) {
      return null;
    }
    return {
      value: tempCurrentFile.path,
      label: tempCurrentFile.name,
      file: tempCurrentFile,
      origin: "workspace" as const,
    };
  }, [tempCurrentFile, workspaceOptions, dataCenterOptions]);

  const datasetOptions = useMemo(() => {
    const options = [...workspaceOptions, ...dataCenterOptions];
    if (fallbackOption) {
      options.push(fallbackOption);
    }
    return options;
  }, [workspaceOptions, dataCenterOptions, fallbackOption]);

  // Update local state when props change
  React.useEffect(() => {
    setTempPipelineName(pipelineName);
    setTempCurrentFile(currentFile);
    setTempDefaultModel(defaultModel);
    setTempOptimizerModel(optimizerModel);
    setTempAutoOptimizeCheck(autoOptimizeCheck);
    setTempSaveOutputToDataCenter(saveOutputToDataCenter);

    // Update YAML when extraPipelineSettings changes
    if (extraPipelineSettings) {
      try {
        setTempYamlSettings(yaml.dump(extraPipelineSettings));
      } catch (e) {
        console.error("Error converting settings to YAML:", e);
      }
    } else {
      setTempYamlSettings("");
    }
  }, [
    pipelineName,
    currentFile,
    defaultModel,
    optimizerModel,
    autoOptimizeCheck,
    extraPipelineSettings,
    saveOutputToDataCenter,
  ]);

  React.useEffect(() => {
    if (!isOpen) return;
    void loadDataCenterDatasets();
  }, [isOpen, loadDataCenterDatasets]);

  const validateYaml = useCallback((yamlString: string) => {
    if (!yamlString.trim()) {
      setYamlError(null);
      return null;
    }

    try {
      const parsed = yaml.load(yamlString);
      setYamlError(null);
      return parsed as Record<string, unknown>;
    } catch (e) {
      const error = e as Error;
      setYamlError(`YAML 无效：${error.message}`);
      return null;
    }
  }, []);

  const handleYamlChange = useCallback(
    (value: string) => {
      setTempYamlSettings(value);
      validateYaml(value);
    },
    [validateYaml]
  );

  const handleSettingsSave = () => {
    setPipelineName(tempPipelineName);
    setCurrentFile(tempCurrentFile);
    setDefaultModel(tempDefaultModel);
    setOptimizerModel(tempOptimizerModel);
    setAutoOptimizeCheck(tempAutoOptimizeCheck);
    setSaveOutputToDataCenter(tempSaveOutputToDataCenter);

    // Process and save YAML settings
    if (tempYamlSettings.trim()) {
      const parsedSettings = validateYaml(tempYamlSettings);
      if (parsedSettings) {
        setExtraPipelineSettings(parsedSettings);
      }
    } else {
      setExtraPipelineSettings(null);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>流水线设置</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="pipelineName">流水线名称</Label>
            <Input
              id="pipelineName"
              value={tempPipelineName}
              onChange={(e) => setTempPipelineName(e.target.value)}
              placeholder="请输入流水线名称"
            />
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="currentFile">数据集 JSON</Label>
            <Select
              value={tempCurrentFile?.path || ""}
              onValueChange={(value) => {
                const selected = datasetOptions.find(
                  (option) => option.value === value
                );
                setTempCurrentFile(selected?.file ?? null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择数据集" />
              </SelectTrigger>
              <SelectContent>
                {workspaceOptions.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>工作区</SelectLabel>
                    {workspaceOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
                {dataCenterOptions.length > 0 ? (
                  <>
                    {workspaceOptions.length > 0 ? <SelectSeparator /> : null}
                    <SelectGroup>
                      <SelectLabel>数据中心</SelectLabel>
                      {dataCenterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span className="flex items-center justify-between gap-2">
                            <span>{option.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {option.source === "pipeline_generated"
                                ? "生成"
                                : "上传"}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                ) : null}
                {fallbackOption ? (
                  <>
                    {workspaceOptions.length > 0 || dataCenterOptions.length > 0 ? (
                      <SelectSeparator />
                    ) : null}
                    <SelectGroup>
                      <SelectLabel>已选择</SelectLabel>
                      <SelectItem value={fallbackOption.value}>
                        {fallbackOption.label}
                      </SelectItem>
                    </SelectGroup>
                  </>
                ) : null}
                {dataCenterLoading ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    正在加载数据中心数据集...
                  </div>
                ) : null}
                {!dataCenterLoading &&
                workspaceOptions.length === 0 &&
                dataCenterOptions.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    暂无可用数据集。
                  </div>
                ) : null}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              选择工作区 JSON 文件或数据中心数据集。
            </p>
            {dataCenterError ? (
              <div className="text-xs text-rose-300">{dataCenterError}</div>
            ) : null}
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="defaultModel">默认模型</Label>
            <ModelInput
              value={tempDefaultModel}
              onChange={setTempDefaultModel}
              placeholder="输入或选择模型..."
              suggestions={defaultModelSuggestions}
            />
            <p className="text-xs text-muted-foreground">
              输入任意 LiteLLM 模型名或从推荐中选择。使用托管版本时，请在
              编辑 {">"} 编辑 API Key 中配置密钥。{" "}
              <a
                href="https://docs.litellm.ai/docs/providers"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                查看支持的模型 {String.fromCharCode(8594)}
              </a>
            </p>
            {defaultModelSuggestions.length > PREDEFINED_MODELS.length ? (
              <p className="text-xs text-muted-foreground">
                已同步模型配置中心中的可用模型，可直接选择。
              </p>
            ) : null}
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="optimize">优化器模型</Label>
            {!hasOpenAIKey && !isLocalMode ? (
              <div className="bg-destructive/10 text-destructive rounded-md p-3 text-xs">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">需要 OpenAI API Key</p>
                    <p className="mt-1">
                      要使用优化器，请在 编辑 {">"} 编辑 API Key 中添加 OpenAI API Key。
                    </p>
                    <button
                      className="text-destructive underline hover:opacity-80 mt-1.5 font-medium"
                      onClick={() => setIsLocalMode(true)}
                    >
                      本地环境变量运行可忽略
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <ModelInput
                  value={tempOptimizerModel}
                  onChange={setTempOptimizerModel}
                  placeholder="输入优化器模型名称..."
                  suggestions={optimizerModelSuggestions}
                />
                <p className="text-xs text-muted-foreground">
                  输入任意 LiteLLM 模型名（例如 &quot;azure/gpt-4o&quot;）
                  或从上方推荐中选择。请确保模型支持 JSON 模式。
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="autoOptimize">自动检查是否需要优化</Label>
            <Switch
              id="autoOptimize"
              checked={tempAutoOptimizeCheck}
              onCheckedChange={(checked) => setTempAutoOptimizeCheck(checked)}
              disabled={!hasOpenAIKey && !isLocalMode}
            />
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="saveOutputToDataCenter">保存输出到数据中心</Label>
            <Switch
              id="saveOutputToDataCenter"
              checked={tempSaveOutputToDataCenter}
              onCheckedChange={(checked) => setTempSaveOutputToDataCenter(checked)}
            />
            <p className="text-xs text-muted-foreground">
              将流水线输出登记为生成数据集并记录血缘。
            </p>
          </div>

          <div className="flex flex-col space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="advancedSettings">高级流水线设置（YAML）</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setTempYamlSettings(SAMPLE_YAML)}
              >
                插入示例
              </Button>
            </div>
            <Textarea
              id="advancedSettings"
              value={tempYamlSettings}
              onChange={(e) => handleYamlChange(e.target.value)}
              placeholder="输入 YAML 配置（限流等高级设置）"
              className="font-mono text-sm h-48 resize-y"
            />
            {yamlError && (
              <div className="text-sm text-destructive">{yamlError}</div>
            )}
            <p className="text-sm text-muted-foreground">
              使用 YAML 配置限流等高级设置，这些配置会传递给后端。
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSettingsSave}
            disabled={!!yamlError && tempYamlSettings.trim() !== ""}
          >
            保存更改
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PipelineSettings;
