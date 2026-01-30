import React, { useState, useCallback, useEffect, useRef } from "react";
import { Operation, File } from "@/app/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OperationCard } from "@/components/OperationCard";
import { Button } from "@/components/ui/button";
import {
  Play,
  PieChart,
  RefreshCw,
  Download,
  FileUp,
  Loader2,
  StopCircle,
  Square,
  Brain,
  GitBranch,
  Pencil,
  Save,
  Plus,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Copy,
  Trash2,
  PlusCircle,
} from "lucide-react";
import { usePipelineContext } from "@/contexts/PipelineContext";
import { usePipelineStore } from "@/contexts/PipelineStoreContext";
import { backendFetch } from "@/lib/backendFetch";
import { notifyRunsUpdated } from "@/lib/run-events";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { Input } from "@/components/ui/input";
import { schemaDictToItemSet } from "./utils";
import { v4 as uuidv4 } from "uuid";
import { useOptimizeCheck } from "@/hooks/useOptimizeCheck";
import {
  canBeOptimized,
  cn,
  DOCWRANGLER_HOSTED_COST_LIMIT,
  isDocWranglerHosted,
} from "@/lib/utils";
import { Textarea } from "./ui/textarea";
import { OptimizationDialog } from "@/components/OptimizationDialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useRestorePipeline } from "@/hooks/useRestorePipeline";

interface PipelineGUIProps {
  variant?: "default" | "execute";
  onRunComplete?: () => void;
}

interface OperationMenuItemProps {
  name: string;
  description: string;
  onClick: () => void;
}

const OperationMenuItem: React.FC<OperationMenuItemProps> = ({
  name,
  description,
  onClick,
}) => {
  return (
    <HoverCard openDelay={0} closeDelay={0}>
      <HoverCardTrigger asChild>
        <div className="relative w-full">
          <DropdownMenuItem
            onClick={onClick}
            className="w-full cursor-help font-medium hover:bg-primary/10"
          >
            {name}
          </DropdownMenuItem>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="right" align="start" className="w-72 p-2">
        <div className="space-y-1">
          <h4 className="font-medium text-sm">{name} 操作</h4>
          <p className="text-xs text-muted-foreground leading-snug">
            {description}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

interface AddOperationDropdownProps {
  onAddOperation: (
    llmType: "LLM" | "non-LLM",
    type: string,
    name: string
  ) => void;
  trigger: React.ReactNode;
}

const OPERATION_TYPE_LABELS: Record<string, string> = {
  map: "映射",
  reduce: "归约",
  resolve: "消歧",
  filter: "过滤",
  parallel_map: "并行映射",
  rank: "排序",
  extract: "抽取",
  unnest: "展开",
  split: "拆分",
  gather: "汇聚",
  sample: "抽样",
  code_map: "代码映射",
  code_reduce: "代码归约",
  code_filter: "代码过滤",
};

const AddOperationDropdown: React.FC<AddOperationDropdownProps> = ({
  onAddOperation,
  trigger,
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        className="max-h-[70vh] overflow-y-auto"
        sideOffset={6}
        collisionPadding={{ top: 24, bottom: 12, left: 8, right: 8 }}
        style={{
          maxHeight: "min(70vh, var(--radix-dropdown-menu-content-available-height))",
        }}
      >
        <DropdownMenuLabel className="font-bold text-sm bg-muted/50 py-2">
          添加 LLM 操作
        </DropdownMenuLabel>
        <OperationMenuItem
          name="映射"
          description="对每条输入进行变换，适合复杂处理与信息提取。1 对 1 操作（每个文档产生一个结果，但输出可以是任意类型，例如列表）。"
          onClick={() => onAddOperation("LLM", "map", "未命名映射")}
        />
        <OperationMenuItem
          name="归约"
          description="按键聚合用于汇总或折叠。多对一操作（多个文档合并成一个结果）。"
          onClick={() => onAddOperation("LLM", "reduce", "未命名归约")}
        />
        <OperationMenuItem
          name="消歧"
          description="识别并合并重复实体以保证数据一致性。文档数量不变，仅对值进行消歧合并。"
          onClick={() => onAddOperation("LLM", "resolve", "未命名消歧")}
        />
        <OperationMenuItem
          name="过滤"
          description="按条件筛选数据，类似 Map，但输出为布尔 schema。结果为 false 的文档会被丢弃，数据量可能减少。"
          onClick={() => onAddOperation("LLM", "filter", "未命名过滤")}
        />
        <OperationMenuItem
          name="并行映射"
          description="类似 Map，但并行处理多个文档以提升性能，适用于文档可独立处理的场景。"
          onClick={() =>
            onAddOperation("LLM", "parallel_map", "未命名并行映射")
          }
        />
        <OperationMenuItem
          name="排序"
          description="按给定条件对文档排序。若使用 `k` 参数可能会裁剪文档；否则返回相同文档但顺序已排序。"
          onClick={() => onAddOperation("LLM", "rank", "未命名排序")}
        />
        <OperationMenuItem
          name="抽取"
          description="按给定条件从文档中抽取指定内容。"
          onClick={() => onAddOperation("LLM", "extract", "未命名抽取")}
        />
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-bold text-sm bg-muted/50 py-2">
          添加非 LLM 操作
        </DropdownMenuLabel>
        <OperationMenuItem
          name="展开"
          description="展开文档中的嵌套数组或对象，为每个嵌套项生成新的文档。"
          onClick={() => onAddOperation("non-LLM", "unnest", "未命名展开")}
        />
        <OperationMenuItem
          name="拆分"
          description="按指定条件将文档拆分为多个部分，每个部分生成新的文档。"
          onClick={() => onAddOperation("non-LLM", "split", "未命名拆分")}
        />
        <OperationMenuItem
          name="汇聚"
          description="基于公共键将多个文档的相关数据汇聚到一个文档中。"
          onClick={() => onAddOperation("non-LLM", "gather", "未命名汇聚")}
        />
        <OperationMenuItem
          name="抽样"
          description="从数据集中随机抽取子集用于测试或分析。"
          onClick={() => onAddOperation("non-LLM", "sample", "未命名抽样")}
        />
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-bold text-sm bg-muted/50 py-2">
          代码操作
        </DropdownMenuLabel>
        <OperationMenuItem
          name="代码映射"
          description="类似 LLM Map，但使用 Python 函数。编写自定义代码对每个文档进行转换。"
          onClick={() =>
            onAddOperation("non-LLM", "code_map", "未命名代码映射")
          }
        />
        <OperationMenuItem
          name="代码归约"
          description="类似 LLM Reduce，但使用 Python 函数。编写自定义代码将多个文档聚合为一个结果。"
          onClick={() =>
            onAddOperation("non-LLM", "code_reduce", "未命名代码归约")
          }
        />
        <OperationMenuItem
          name="代码过滤"
          description="类似 LLM Filter，但使用 Python 函数。编写自定义代码决定保留哪些文档。"
          onClick={() =>
            onAddOperation("non-LLM", "code_filter", "未命名代码过滤")
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const PipelineGUI: React.FC<PipelineGUIProps> = ({
  variant = "default",
  onRunComplete,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const onRunCompleteRef = useRef(onRunComplete);
  const {
    operations,
    setOperations,
    pipelineName,
    setPipelineName,
    sampleSize,
    setSampleSize,
    setNumOpRun,
    currentFile,
    setCurrentFile,
    setFiles,
    setOutput,
    isLoadingOutputs,
    setIsLoadingOutputs,
    files,
    setCost,
    cost,
    defaultModel,
    setDefaultModel,
    setTerminalOutput,
    optimizerModel,
    setOptimizerModel,
    setOptimizerProgress,
    autoOptimizeCheck,
    setAutoOptimizeCheck,
    systemPrompt,
    setSystemPrompt,
    namespace,
    apiKeys,
    unsavedChanges,
  } = usePipelineContext();
  const {
    pipelines,
    activePipelineId,
    createPipeline,
    duplicatePipeline,
    deletePipeline,
    renamePipeline,
    switchPipeline,
    saveActivePipeline,
    saving: isSavingPipeline,
  } = usePipelineStore();
  const { toast } = useToast();
  const { connect, sendMessage, lastMessage, readyState, disconnect } =
    useWebSocket();
  const [optimizationDialog, setOptimizationDialog] = useState<{
    isOpen: boolean;
    content: string;
    prompt?: string;
    inputData?: Array<Record<string, unknown>>;
    outputData?: Array<Record<string, unknown>>;
    operationName?: string;
    operationId?: string;
  }>({
    isOpen: false,
    content: "",
    prompt: undefined,
    operationName: undefined,
    operationId: undefined,
  });
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedPipelineName, setEditedPipelineName] = useState(pipelineName);
  const [isLeftSideCollapsed, setIsLeftSideCollapsed] = useState(false);

  useEffect(() => {
    onRunCompleteRef.current = onRunComplete;
  }, [onRunComplete]);

  const { submitTask } = useOptimizeCheck({
    onComplete: (result) => {
      setOperations((prev) => {
        const newOps = [...prev];
        if (newOps.length > 0) {
          const lastOp = newOps[newOps.length - 1];
          lastOp.shouldOptimizeResult = result.should_optimize;
        }
        return newOps;
      });
      setCost((prev) => prev + result.cost);

      if (result.should_optimize) {
        toast({
          title: `建议拆分 ${operations[operations.length - 1].name}`,
          description: (
            <span
              className="cursor-pointer text-blue-500 hover:text-blue-700"
              onClick={() => {
                const lastOp = operations[operations.length - 1];
                setOptimizationDialog({
                  isOpen: true,
                  content: result.should_optimize,
                  prompt: lastOp.prompt || "未设置提示词",
                  operationName: lastOp.name,
                  operationId: lastOp.id,
                  inputData: result.input_data,
                  outputData: result.output_data,
                });
              }}
            >
              点击查看原因
            </span>
          ),
          duration: Infinity,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "优化检查失败",
        description: error,
        variant: "destructive",
      });
    },
  });

  const { restoreFromYAML } = useRestorePipeline({
    setOperations,
    setPipelineName,
    setSampleSize,
    setDefaultModel,
    setFiles,
    setCurrentFile,
    setSystemPrompt,
    files,
    setOutput,
  });

  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === "output") {
        setTerminalOutput(lastMessage.data);
      } else if (lastMessage.type === "optimizer_progress") {
        setOptimizerProgress({
          status: lastMessage.status,
          progress: lastMessage.progress,
          shouldOptimize: lastMessage.should_optimize,
          rationale: lastMessage.rationale,
          validatorPrompt: lastMessage.validator_prompt,
        });
      } else if (lastMessage.type === "result") {
        const runCost = lastMessage.data.cost || 0;
        setOptimizerProgress(null);

        // See if there was an optimized operation
        const optimizedOps = lastMessage.data.optimized_ops;
        if (optimizedOps) {
          const newOperations = optimizedOps.map((optimizedOp) => {
            const {
              id,
              type,
              name,
              prompt,
              output,
              validate,
              gleaning,
              sample,
              ...otherKwargs
            } = optimizedOp;

            // Find matching operation in previous operations list
            const existingOp = operations.find((op) => op.name === name);

            return {
              id: id || uuidv4(),
              llmType:
                type === "map" ||
                  type === "reduce" ||
                  type === "resolve" ||
                  type === "filter" ||
                  type === "parallel_map" ||
                  type === "rank" ||
                  type === "extract"
                  ? "LLM"
                  : "non-LLM",
              type: type,
              name: name || "未命名操作",
              prompt: prompt,
              output: output
                ? {
                  schema: schemaDictToItemSet(output.schema),
                }
                : undefined,
              validate: validate,
              gleaning: gleaning,
              sample: sample,
              otherKwargs: otherKwargs || {},
              ...(existingOp?.runIndex && { runIndex: existingOp.runIndex }),
              visibility: true,
            } as Operation;
          });

          setOperations(newOperations);
        } else {
          // No optimized operations, so we need to check if we should optimize the last operation
          // Trigger should optimize for the last operation
          if (autoOptimizeCheck) {
            const lastOp = operations[operations.length - 1];
            if (lastOp && canBeOptimized(lastOp.type)) {
              submitTask({
                yaml_config: lastMessage.data.yaml_config,
                step_name: "data_processing", // TODO: Make this a constant
                op_name: lastOp.name,
              });
            }
          }
        }

        setCost((prevCost) => prevCost + runCost);
        toast({
          title: "执行完成",
          duration: 3000,
        });
        notifyRunsUpdated();
        onRunCompleteRef.current?.();

        // Close the WebSocket connection
        disconnect();

        setIsLoadingOutputs(false);
      } else if (lastMessage.type === "error") {
        let description = lastMessage.data;
        if (description.includes("Connection error")) {
          description =
            description +
            " 建议检查 API Key（编辑 > 编辑 API Key），并确保网络连接稳定。";
        }
        toast({
          title: "执行错误",
          description: description,
          variant: "destructive",
          duration: Infinity,
        });
        notifyRunsUpdated();

        // Close the WebSocket connection
        disconnect();

        setIsLoadingOutputs(false);
      }
    }
  }, [lastMessage, setCost, setIsLoadingOutputs, setTerminalOutput]);

  useEffect(() => {
    if (pipelineName) {
      setEditedPipelineName(pipelineName);
    }
  }, [pipelineName]);

  useEffect(() => {
    if (autoOptimizeCheck) {
      setAutoOptimizeCheck(autoOptimizeCheck);
    }
  }, [autoOptimizeCheck]);

  useEffect(() => {
    if (defaultModel) {
      setDefaultModel(defaultModel);
    }
  }, [defaultModel]);

  useEffect(() => {
    if (currentFile) {
      setCurrentFile(currentFile);
    }
  }, [currentFile]);

  useEffect(() => {
    if (optimizerModel) {
      setOptimizerModel(optimizerModel);
    }
  }, [optimizerModel]);

  useEffect(() => {
    if (variant !== "execute") {
      return;
    }
    if (!unsavedChanges) {
      return;
    }
    if (isLoadingOutputs) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!isSavingPipeline) {
        void saveActivePipeline();
      }
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [isLoadingOutputs, isSavingPipeline, saveActivePipeline, unsavedChanges, variant]);

  useEffect(() => {
    if (variant !== "execute") {
      return;
    }
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "hidden" &&
        unsavedChanges &&
        !isSavingPipeline &&
        !isLoadingOutputs
      ) {
        void saveActivePipeline();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isLoadingOutputs, isSavingPipeline, saveActivePipeline, unsavedChanges, variant]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width < 1100) {
          setIsLeftSideCollapsed(true);
        } else {
          setIsLeftSideCollapsed(false);
        }
      }
    });

    if (headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const fileToUpload: File = {
          name: file.name,
          path: file.name,
          type: "pipeline-yaml",
          blob: file,
        };
        await restoreFromYAML(fileToUpload);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Error handling file upload:", error);
        console.error("Upload error details:", errorMessage);
      }
    }
  };

  const handleExport = async () => {
    try {
      const response = await backendFetch("/api/getPipelineConfig", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          default_model: defaultModel,
          data: { path: currentFile?.path || "" },
          operations,
          operation_id: operations[operations.length - 1].id,
          name: pipelineName,
          sample_size: sampleSize,
          namespace: namespace,
          system_prompt: systemPrompt,
          optimizerModel: optimizerModel,
        }),
      });

      if (!response.ok) {
        throw new Error("导出流水线配置失败");
      }

      const { pipelineConfig } = await response.json();

      const blob = new Blob([pipelineConfig], { type: "text/yaml" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `${pipelineName}.yaml`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "已导出流水线",
        description: `流水线配置已成功导出为 ${pipelineName}.yaml。`,
        duration: 3000,
      });
    } catch (error) {
      console.error("Error exporting pipeline configuration:", error);
      toast({
        title: "错误",
        description: "导出流水线配置失败",
        variant: "destructive",
      });
    }
  };

  const onRunAll = useCallback(
    async (clear_intermediate: boolean) => {
      // Check if cost exceeds limit and no API keys are set
      if (
        isDocWranglerHosted() &&
        cost > DOCWRANGLER_HOSTED_COST_LIMIT &&
        (!apiKeys || Object.keys(apiKeys).length === 0)
      ) {
        toast({
          title: "成本超出限制",
          description: `当前操作可能超过 $${DOCWRANGLER_HOSTED_COST_LIMIT.toFixed(
            2
          )} 的费用限制，请在设置中添加 API Key 后继续。`,
          variant: "destructive",
          duration: 5000,
        });
        return;
      }

      // Find the last visible operation
      const lastVisibleOpIndex = operations.findLastIndex(
        (op) => op.visibility !== false
      );
      if (lastVisibleOpIndex < 0) return;

      const lastOperation = operations[lastVisibleOpIndex];
      setOptimizerProgress(null);
      setIsLoadingOutputs(true);
      setNumOpRun((prevNum) => {
        const newNum = prevNum + operations.length;
        const updatedOperations = operations.map((op, index) => ({
          ...op,
          runIndex: prevNum + index + 1,
          shouldOptimizeResult: undefined,
        }));
        setOperations(updatedOperations);
        return newNum;
      });

      setTerminalOutput("");

      try {
        // Get the latest API keys from context
        const currentApiKeys = apiKeys;

        const response = await backendFetch("/api/writePipelineConfig", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            default_model: defaultModel,
            data: { path: currentFile?.path || "" },
            operations,
            operation_id: lastOperation.id,
            name: pipelineName,
            sample_size: sampleSize,
            clear_intermediate: clear_intermediate,
            system_prompt: systemPrompt,
            namespace: namespace,
            apiKeys: currentApiKeys, // Use the latest API keys
            optimizerModel: optimizerModel,
          }),
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const { filePath, inputPath, outputPath } = await response.json();

        setOutput({
          operationId: lastOperation.id,
          path: outputPath,
          inputPath: inputPath,
        });

        // Ensure the WebSocket is connected before sending the message
        await connect();

        sendMessage({
          yaml_config: filePath,
          clear_intermediate: clear_intermediate,
          pipeline_id: activePipelineId,
          namespace: namespace,
        });
      } catch (error) {
        console.error("Error writing pipeline config:", error);
        toast({
          title: "错误",
          description: error.message,
          variant: "destructive",
        });
        // Close the WebSocket connection
        disconnect();
        setIsLoadingOutputs(false);
      }
    },
    [
      operations,
      currentFile,
      setIsLoadingOutputs,
      setNumOpRun,
      sendMessage,
      readyState,
      defaultModel,
      pipelineName,
      sampleSize,
      apiKeys,
      systemPrompt,
      namespace,
      variant,
      cost,
      activePipelineId,
    ]
  );

  const handleAddOperation = (
    llmType: "LLM" | "non-LLM",
    type: string,
    name: string
  ) => {
    const newOperation: Operation = {
      id: String(Date.now()),
      llmType,
      type: type as Operation["type"],
      name: `${name} ${operations.length}`,
      visibility: true,
    };
    setOperations([...operations, newOperation]);
  };

  const handleStop = () => {
    if (readyState === WebSocket.OPEN) {
      sendMessage("kill");
    }

    disconnect();
    setOptimizerProgress(null);
    setIsLoadingOutputs(false);
    toast({
      title: "已请求停止",
      description: "正在终止当前流程...",
      duration: 3000,
    });
  };

  const handleOptimizeFromDialog = async () => {
    if (!optimizationDialog.operationId) return;

    try {
      setTerminalOutput("");
      setIsLoadingOutputs(true);

      const response = await backendFetch("/api/writePipelineConfig", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          default_model: defaultModel,
          data: { path: currentFile?.path || "" },
          operations,
          operation_id: optimizationDialog.operationId,
          name: pipelineName,
          sample_size: sampleSize,
          optimize: true,
          namespace: namespace,
          apiKeys: apiKeys,
          optimizerModel: optimizerModel,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const { filePath } = await response.json();

      await connect();

      sendMessage({
        yaml_config: filePath,
        optimize: true,
        pipeline_id: activePipelineId,
        namespace: namespace,
      });
    } catch (error) {
      console.error("Error optimizing operation:", error);
      toast({
        title: "错误",
        description: error.message,
        variant: "destructive",
      });
      disconnect();
      setIsLoadingOutputs(false);
    }
  };

  const handleRenamePipeline = useCallback(async () => {
    if (!activePipelineId) {
      setIsEditingName(false);
      return;
    }

    const nextName =
      editedPipelineName.trim() === ""
        ? "未命名管线"
        : editedPipelineName.trim();
    await renamePipeline(activePipelineId, nextName);
    setIsEditingName(false);
  }, [activePipelineId, editedPipelineName, renamePipeline]);

  const handleManualSave = useCallback(async () => {
    if (!unsavedChanges) {
      toast({
        title: "已是最新",
        description: "当前执行流程没有需要保存的更改。",
        duration: 2000,
      });
      return;
    }
    const saved = await saveActivePipeline();
    if (saved) {
      toast({
        title: "已保存",
        description: "执行流程已更新。",
        duration: 2000,
      });
    }
  }, [saveActivePipeline, toast, unsavedChanges]);

  return (
    <div className="flex flex-col h-full">
      <div
        ref={headerRef}
        className={`flex-none relative sticky top-0 z-10 ${
          variant === "execute"
            ? "border-b border-slate-200 bg-white"
            : "bg-background border-b shadow-sm"
        }`}
      >
        {variant === "execute" ? (
          <div className="flex items-center justify-between px-6 py-4 bg-white">
            <div className="flex items-center gap-4">
              <h3 className="text-xs uppercase tracking-wider font-bold text-slate-500">
                执行流程
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors border disabled:opacity-50 disabled:cursor-not-allowed ${
                  unsavedChanges
                    ? "text-amber-700 border-amber-300 bg-amber-50 hover:bg-amber-100"
                    : "text-slate-600 border-slate-200 hover:text-slate-900 hover:bg-slate-100"
                }`}
                onClick={handleManualSave}
                disabled={isSavingPipeline}
              >
                {isSavingPipeline ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {isSavingPipeline ? "保存中" : "保存"}
                {unsavedChanges && !isSavingPipeline ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                ) : null}
              </button>
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                onClick={handleStop}
                disabled={!isLoadingOutputs}
              >
                <Square className="w-3 h-3 fill-current" />
                停止
              </button>
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                onClick={() => onRunAll(true)}
                disabled={isLoadingOutputs}
              >
                {isLoadingOutputs ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                重新运行
              </button>
              <button
                type="button"
                className="flex items-center gap-2 px-4 py-1.5 text-white bg-blue-600 hover:bg-blue-500 rounded-md text-xs font-medium shadow-sm transition-all disabled:opacity-50 disabled:bg-slate-300"
                onClick={() => onRunAll(false)}
                disabled={isLoadingOutputs}
              >
                {isLoadingOutputs ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
                运行
              </button>
            </div>
          </div>
        ) : (
          <div className="p-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                {isEditingName ? (
                  <Input
                    value={editedPipelineName}
                    onChange={(e) => setEditedPipelineName(e.target.value)}
                    onBlur={handleRenamePipeline}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void handleRenamePipeline();
                      }
                    }}
                    className="max-w-[240px] h-8 text-sm font-semibold"
                    autoFocus
                  />
                ) : (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 flex items-center gap-2"
                        >
                          <GitBranch size={14} />
                          <span className="font-semibold max-w-[180px] truncate">
                            {pipelineName}
                          </span>
                          {unsavedChanges && (
                            <span className="h-2 w-2 rounded-full bg-orange-500" />
                          )}
                          <ChevronDown
                            size={14}
                            className="text-muted-foreground"
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-72 max-h-[70vh] overflow-y-auto">
                        <DropdownMenuLabel>选择流水线</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {pipelines.length === 0 ? (
                          <DropdownMenuItem disabled>暂无流水线</DropdownMenuItem>
                        ) : (
                          pipelines.map((pipeline) => (
                            <DropdownMenuItem
                              key={pipeline.id}
                              onSelect={() => switchPipeline(pipeline.id)}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="truncate">{pipeline.name}</span>
                              {pipeline.id === activePipelineId && (
                                <span className="text-xs text-primary font-medium">
                                  当前
                                </span>
                              )}
                            </DropdownMenuItem>
                          ))
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => setIsEditingName(true)}
                          disabled={!activePipelineId}
                        >
                          <Pencil size={14} className="mr-2" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            activePipelineId &&
                            duplicatePipeline(
                              activePipelineId,
                              `${pipelineName} 副本`
                            )
                          }
                          disabled={!activePipelineId}
                        >
                          <Copy size={14} className="mr-2" />
                          复制当前
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => createPipeline()}>
                          <PlusCircle size={14} className="mr-2" />
                          新建流水线
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            if (activePipelineId) {
                              const confirmed = window.confirm(
                                "确定要删除当前流水线吗？此操作不可恢复。"
                              );
                              if (confirmed) {
                                void deletePipeline(activePipelineId);
                              }
                            }
                          }}
                          disabled={!activePipelineId}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 size={14} className="mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <span className="text-xs text-muted-foreground">
                      共 {pipelines.length} 条
                    </span>
                  </>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 flex-shrink-0"
                  onClick={() => setIsLeftSideCollapsed(!isLeftSideCollapsed)}
                >
                  {isLeftSideCollapsed ? (
                    <ChevronRight size={16} />
                  ) : (
                    <ChevronLeft size={16} />
                  )}
                </Button>

                <div
                  className={`flex items-center gap-2 transition-transform duration-200 origin-left ${
                    isLeftSideCollapsed ? "scale-x-0 w-0" : "scale-x-100"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 whitespace-nowrap"
                        >
                          <GitBranch size={14} className="mr-2" />
                          概览
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="bottom"
                        align="start"
                        className="w-96 p-4"
                      >
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <h4 className="font-medium">流水线流程</h4>
                            <span className="text-xs text-muted-foreground">
                              {operations.filter((op) => op.visibility).length}{" "}
                              个操作
                            </span>
                          </div>
                          <div className="bg-muted p-3 rounded-md space-y-2">
                            {operations.length > 0 ? (
                              operations
                                .filter((op) => op.visibility)
                                .map((op, index, arr) => (
                                  <div key={op.id} className="flex items-center">
                                    <div className="flex-1 bg-background p-2 rounded-md text-sm">
                                      <div className="font-medium">{op.name}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {OPERATION_TYPE_LABELS[op.type] ?? op.type}
                                      </div>
                                    </div>
                                    {index < arr.length - 1 && (
                                      <div className="mx-2 text-muted-foreground">
                                        ↓
                                      </div>
                                    )}
                                  </div>
                                ))
                            ) : (
                              <div className="text-sm text-muted-foreground">
                                流水线中暂无操作
                              </div>
                            )}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 whitespace-nowrap"
                        >
                          <Brain size={14} className="mr-2" />
                          系统提示词
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-88">
                        <div className="grid gap-3">
                          <div className="space-y-1">
                            <h4 className="text-lg font-semibold">
                              系统配置
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              以下内容会加入每个操作的系统提示词。
                            </p>
                          </div>
                          <div className="grid gap-3">
                            <div className="space-y-1">
                              <Label
                                htmlFor="datasetDescription"
                                className="text-sm font-medium"
                              >
                                数据集描述
                              </Label>
                              <Textarea
                                id="datasetDescription"
                                placeholder="一组文档集合"
                                defaultValue={systemPrompt.datasetDescription}
                                onBlur={(e) => {
                                  const value = e.target.value;
                                  setTimeout(() => {
                                    setSystemPrompt((prev) => ({
                                      ...prev,
                                      datasetDescription: value,
                                    }));
                                  }, 0);
                                }}
                                className="h-[3.5rem]"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label
                                htmlFor="persona"
                                className="text-sm font-medium"
                              >
                                角色设定
                              </Label>
                              <Textarea
                                id="persona"
                                placeholder="一个有帮助的助手"
                                defaultValue={systemPrompt.persona}
                                onBlur={(e) => {
                                  const value = e.target.value;
                                  setTimeout(() => {
                                    setSystemPrompt((prev) => ({
                                      ...prev,
                                      persona: value,
                                    }));
                                  }, 0);
                                }}
                                className="h-[3.5rem]"
                              />
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    <TooltipProvider>
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <div className="flex items-center flex-shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 flex items-center gap-2 whitespace-nowrap"
                            >
                              <PieChart size={14} />
                              <Input
                                type="number"
                                value={sampleSize || ""}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setSampleSize(
                                    value === "" ? null : parseInt(value, 10)
                                  );
                                }}
                                className="w-12 h-6 text-xs border-0 p-0 focus-visible:ring-0"
                                placeholder="全部"
                              />
                            </Button>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>在样本文档上运行流水线</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <div className="flex items-center border-l pl-2 flex-shrink-0">
                    <div className="flex items-center space-x-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => fileInputRef.current?.click()}
                              className="h-8 w-8"
                            >
                              <FileUp size={16} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>从 YAML 导入</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".yaml,.yml"
                        className="hidden"
                      />
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleExport()}
                              className="h-8 w-8"
                            >
                              <Download size={16} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>导出为 YAML</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 flex-shrink-0">
                <AddOperationDropdown
                  onAddOperation={handleAddOperation}
                  trigger={
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-sm whitespace-nowrap"
                    >
                      添加操作 <Plus size={16} className="ml-2" />
                    </Button>
                  }
                />

                <div className="flex space-x-2 border-l pl-3">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="rounded-sm whitespace-nowrap"
                    onClick={handleStop}
                    disabled={!isLoadingOutputs}
                  >
                    <StopCircle size={16} className="mr-2" />
                    停止
                  </Button>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="rounded-sm bg-secondary hover:bg-secondary/90 text-secondary-foreground font-medium whitespace-nowrap"
                          onClick={() => onRunAll(true)}
                          disabled={isLoadingOutputs}
                        >
                          {isLoadingOutputs ? (
                            <Loader2 size={16} className="mr-2 animate-spin" />
                          ) : (
                            <RefreshCw size={16} className="mr-2" />
                          )}
                          清空重跑
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="w-72">
                        <p>清空缓存后运行流水线</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    size="sm"
                    variant="default"
                    className="rounded-sm whitespace-nowrap"
                    disabled={isLoadingOutputs}
                    onClick={() => onRunAll(false)}
                  >
                    {isLoadingOutputs ? (
                      <Loader2 size={16} className="mr-2 animate-spin" />
                    ) : (
                      <Play size={16} className="mr-2" />
                    )}
                    运行
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div
        className={`flex-1 overflow-y-auto min-h-0 ${
          variant === "execute" ? "p-6 bg-slate-50" : "p-2"
        }`}
      >
        <div
          className={cn(
            "space-y-2",
            variant === "execute" &&
              "relative before:absolute before:inset-y-6 before:left-3 before:w-px before:bg-slate-200"
          )}
        >
          {operations.map((op, index) => (
            <div key={op.id} id={`op-${op.id}`} className="scroll-mt-28">
              <OperationCard index={index} id={op.id} variant={variant} />
            </div>
          ))}
          <AddOperationDropdown
            onAddOperation={handleAddOperation}
            trigger={
              <Button
                variant="outline"
                className={cn(
                  "w-full border-dashed h-16 hover:border-primary hover:bg-accent/50 transition-colors",
                  variant === "execute" &&
                    "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Plus className="mr-2 h-4 w-4" />
                添加操作
              </Button>
            }
          />
        </div>
      </div>
      <OptimizationDialog
        isOpen={optimizationDialog.isOpen}
        content={optimizationDialog.content}
        prompt={optimizationDialog.prompt}
        operationName={optimizationDialog.operationName}
        inputData={optimizationDialog.inputData}
        outputData={optimizationDialog.outputData}
        onOpenChange={(open) =>
          setOptimizationDialog((prev) => ({ ...prev, isOpen: open }))
        }
        onDecompose={handleOptimizeFromDialog}
      />
    </div>
  );
};

export default PipelineGUI;
