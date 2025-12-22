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

const PREDEFINED_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "claude-3-7-sonnet-20250219",
  "claude-3-opus-20240229",
  "azure/<your-deployment-name>",
  "gemini/gemini-2.0-flash",
] as const;

interface ModelInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suggestions?: readonly string[];
}

export const ModelInput: React.FC<ModelInputProps> = ({
  value,
  onChange,
  placeholder,
  suggestions = PREDEFINED_MODELS,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="relative">
      <Input
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full"
        placeholder={placeholder}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setTimeout(() => setIsFocused(false), 200);
        }}
      />
      {isFocused &&
        (value === "" ||
          suggestions.some((model) =>
            model.toLowerCase().includes(value?.toLowerCase() || "")
          )) && (
          <div className="absolute top-full left-0 w-full mt-1 bg-popover rounded-md border shadow-md z-50 max-h-[200px] overflow-y-auto">
            {suggestions
              .filter(
                (model) =>
                  value === "" ||
                  model.toLowerCase().includes(value.toLowerCase())
              )
              .map((model) => (
                <div
                  key={model}
                  className="px-2 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onChange(model);
                    setIsFocused(false);
                  }}
                >
                  {model}
                </div>
              ))}
          </div>
        )}
    </div>
  );
};

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

const SAMPLE_YAML = `# Example configuration - delete or modify as needed
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
        throw new Error(detail || "Failed to load Data Center datasets");
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
          : "Failed to load Data Center datasets"
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
          parentFolder: "Data Center",
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
      setYamlError(`Invalid YAML: ${error.message}`);
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
          <DialogTitle>Pipeline Settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="pipelineName">Pipeline Name</Label>
            <Input
              id="pipelineName"
              value={tempPipelineName}
              onChange={(e) => setTempPipelineName(e.target.value)}
              placeholder="Enter pipeline name"
            />
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="currentFile">Dataset JSON</Label>
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
                <SelectValue placeholder="Select a dataset" />
              </SelectTrigger>
              <SelectContent>
                {workspaceOptions.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel>Workspace</SelectLabel>
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
                      <SelectLabel>Data Center</SelectLabel>
                      {dataCenterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <span className="flex items-center justify-between gap-2">
                            <span>{option.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {option.source === "pipeline_generated"
                                ? "Generated"
                                : "Uploaded"}
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
                      <SelectLabel>Selected</SelectLabel>
                      <SelectItem value={fallbackOption.value}>
                        {fallbackOption.label}
                      </SelectItem>
                    </SelectGroup>
                  </>
                ) : null}
                {dataCenterLoading ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    Loading Data Center datasets...
                  </div>
                ) : null}
                {!dataCenterLoading &&
                workspaceOptions.length === 0 &&
                dataCenterOptions.length === 0 ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">
                    No datasets available.
                  </div>
                ) : null}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose a workspace JSON file or a Data Center dataset.
            </p>
            {dataCenterError ? (
              <div className="text-xs text-rose-300">{dataCenterError}</div>
            ) : null}
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="defaultModel">Default Model</Label>
            <ModelInput
              value={tempDefaultModel}
              onChange={setTempDefaultModel}
              placeholder="Enter or select a model..."
            />
            <p className="text-xs text-muted-foreground">
              Enter any LiteLLM model name or select from suggestions. Make sure
              you&apos;ve set your API keys in Edit {">"} Edit API Keys when
              using our hosted app.{" "}
              <a
                href="https://docs.litellm.ai/docs/providers"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                View all supported models {String.fromCharCode(8594)}
              </a>
            </p>
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="optimize">Optimizer Model</Label>
            {!hasOpenAIKey && !isLocalMode ? (
              <div className="bg-destructive/10 text-destructive rounded-md p-3 text-xs">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">OpenAI API Key Required</p>
                    <p className="mt-1">
                      To use the optimizer, please add your OpenAI API key in
                      Edit {">"} Edit API Keys.
                    </p>
                    <button
                      className="text-destructive underline hover:opacity-80 mt-1.5 font-medium"
                      onClick={() => setIsLocalMode(true)}
                    >
                      Skip if running locally with environment variables
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <ModelInput
                  value={tempOptimizerModel}
                  onChange={setTempOptimizerModel}
                  placeholder="Enter optimizer model name..."
                  suggestions={["gpt-4o", "gpt-4o-mini"]}
                />
                <p className="text-xs text-muted-foreground">
                  Enter any LiteLLM model name (e.g., &quot;azure/gpt-4o&quot;)
                  or select from suggestions above. Make sure the model supports
                  JSON mode.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="autoOptimize">
              Automatically Check Whether to Optimize
            </Label>
            <Switch
              id="autoOptimize"
              checked={tempAutoOptimizeCheck}
              onCheckedChange={(checked) => setTempAutoOptimizeCheck(checked)}
              disabled={!hasOpenAIKey && !isLocalMode}
            />
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="saveOutputToDataCenter">
              Save Output to Data Center
            </Label>
            <Switch
              id="saveOutputToDataCenter"
              checked={tempSaveOutputToDataCenter}
              onCheckedChange={(checked) => setTempSaveOutputToDataCenter(checked)}
            />
            <p className="text-xs text-muted-foreground">
              Registers pipeline output as a generated dataset with lineage.
            </p>
          </div>

          <div className="flex flex-col space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="advancedSettings">
                Advanced Pipeline Settings (YAML)
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setTempYamlSettings(SAMPLE_YAML)}
              >
                Add Example
              </Button>
            </div>
            <Textarea
              id="advancedSettings"
              value={tempYamlSettings}
              onChange={(e) => handleYamlChange(e.target.value)}
              placeholder="Enter YAML configuration for rate limits and other advanced settings"
              className="font-mono text-sm h-48 resize-y"
            />
            {yamlError && (
              <div className="text-sm text-destructive">{yamlError}</div>
            )}
            <p className="text-sm text-muted-foreground">
              Configure rate limits and other advanced settings in YAML format.
              These settings will be passed to the backend.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={handleSettingsSave}
            disabled={!!yamlError && tempYamlSettings.trim() !== ""}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PipelineSettings;
