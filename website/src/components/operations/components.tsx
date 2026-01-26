import React, { useMemo, useEffect } from "react";
import { Operation, SchemaItem } from "@/app/types";
import { OutputSchema, PromptInput, CodeInput } from "./args";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "../ui/button";
import { Plus, X, Info } from "lucide-react";
import { ModelInput } from "@/components/ModelInput";
import { useModelRegistry } from "@/hooks/useModelRegistry";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "../ui/textarea";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";

interface PromptConfig {
  prompt: string;
  output_keys?: string[];
  model?: string;
}

interface MethodKwargs {
  delimiter?: string;
  num_tokens?: number;
  stratify_key?: string;
  embedding_keys?: string[];
  std?: number;
  keep?: boolean;
}

interface PeripheralChunkConfig {
  content_key?: string;
  count?: number;
}

interface PeripheralChunksSection {
  head?: PeripheralChunkConfig;
  middle?: PeripheralChunkConfig;
  tail?: PeripheralChunkConfig;
}

interface PeripheralChunks {
  previous?: PeripheralChunksSection;
  next?: PeripheralChunksSection;
}

interface OtherKwargs {
  prompts?: PromptConfig[];
  method?: string;
  method_kwargs?: MethodKwargs;
  reduce_key?: string[];
  comparison_prompt?: string;
  resolution_prompt?: string;
  blocking_threshold?: number;
  blocking_keys?: string[];
  split_key?: string;
  unnest_key?: string;
  recursive?: boolean;
  depth?: number;
  content_key?: string;
  doc_id_key?: string;
  order_key?: string;
  peripheral_chunks?: PeripheralChunks;
  samples?: string | number;
  code?: string;
  document_keys?: string[];
  extraction_method?: string;
  format_extraction?: boolean;
  direction?: string;
  rerank_call_budget?: number;
  input_keys?: string[];
  pdf_url_key?: string;
}

interface OperationComponentProps {
  operation: Operation;
  isSchemaExpanded: boolean;
  onUpdate: (updatedOperation: Operation) => void;
  onToggleSchema: () => void;
}

export const MapFilterOperationComponent: React.FC<OperationComponentProps> = ({
  operation,
  isSchemaExpanded,
  onUpdate,
  onToggleSchema,
}) => {
  const schemaItems = useMemo(
    () => operation?.output?.schema || [],
    [operation?.output?.schema]
  );

  const handlePromptChange = (newPrompt: string) => {
    onUpdate({ ...operation, prompt: newPrompt });
  };

  const handleSchemaUpdate = (newSchema: SchemaItem[]) => {
    onUpdate({
      ...operation,
      output: {
        ...operation.output,
        schema: newSchema,
      },
    });
  };

  // Handle changes to the PDF URL key using otherKwargs
  const handlePdfUrlKeyChange = (newPdfUrlKey: string) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        pdf_url_key: newPdfUrlKey,
      },
    });
  };

  return (
    <>
      <PromptInput
        prompt={operation.prompt || ""}
        onChange={handlePromptChange}
      />
      <OutputSchema
        schema={schemaItems}
        onUpdate={handleSchemaUpdate}
        isExpanded={isSchemaExpanded}
        onToggle={onToggleSchema}
      />

      {/* PDF Processing Section */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="pdf-url-key" className="text-xs font-semibold">
            PDF URL 字段
          </Label>
          <HoverCard>
            <HoverCardTrigger>
              <Info size={16} className="text-primary cursor-help" />
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-2">
                <h4 className="font-medium">PDF 处理</h4>
                <p className="text-sm text-muted-foreground">
                  指定数据中包含 PDF URL 或文件路径的字段名。留空将关闭 PDF 处理。
                </p>
                <div className="mt-2 rounded-md bg-muted p-2">
                  <p className="text-sm font-medium">示例：</p>
                  <p className="text-xs text-muted-foreground">
                    如果输入数据包含 <code>{"url"}</code> 字段/列，且值为 PDF 的
                    URL，请在此填写 <code>{"url"}</code>。
                  </p>
                </div>
                <p className="text-xs text-gray-600 font-medium mt-1">
                  注意：PDF 处理仅支持 Claude 和 Gemini 模型。
                </p>
                <a
                  href="https://ucbepic.github.io/docetl/operators/map/#pdf-processing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline flex items-center gap-1 pt-2"
                >
                  <span>了解 PDF 处理详情</span>
                  <Info className="h-3 w-3" />
                </a>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
        <Input
          id="pdf-url-key"
          type="text"
          value={operation.otherKwargs?.pdf_url_key || ""}
          onChange={(e) => handlePdfUrlKeyChange(e.target.value)}
          placeholder="例如：url 或 pdf_path"
        />
      </div>
    </>
  );
};

export const ReduceOperationComponent: React.FC<OperationComponentProps> = ({
  operation,
  isSchemaExpanded,
  onUpdate,
  onToggleSchema,
}) => {
  const schemaItems = useMemo(() => {
    return operation?.output?.schema || [];
  }, [operation?.output?.schema]);

  const handlePromptChange = (newPrompt: string) => {
    onUpdate({ ...operation, prompt: newPrompt });
  };

  const handleSchemaUpdate = (newSchema: SchemaItem[]) => {
    onUpdate({
      ...operation,
      output: {
        ...operation.output,
        schema: newSchema,
      },
    });
  };

  const handleReduceKeysChange = (newReduceKeys: string[]) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        reduce_key: newReduceKeys,
      },
    });
  };

  useEffect(() => {
    if (!operation.otherKwargs?.reduce_key) {
      handleReduceKeysChange(["_all"]);
    }
  }, []);

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center space-x-2">
          <Label htmlFor="reduce-keys" className="w-1/4">
            归约键
          </Label>
          <div className="flex-grow flex items-center space-x-2 overflow-x-auto">
            <div className="flex-nowrap flex items-center space-x-2">
              {(operation.otherKwargs?.reduce_key || [""]).map(
                (key: string, index: number) => (
                  <div
                    key={index}
                    className="relative flex-shrink-0"
                    style={{ minWidth: "150px" }}
                  >
                    <div className="flex items-center">
                      <Input
                        id={`reduce-key-${index}`}
                        value={key}
                        onChange={(e) => {
                          const newKeys = [
                            ...(operation.otherKwargs?.reduce_key || [""]),
                          ];
                          newKeys[index] = e.target.value;
                          handleReduceKeysChange(newKeys);
                        }}
                        placeholder="请输入归约键"
                        className={`w-full pr-8 ${
                          !key.trim() ? "border-red-500 focus:ring-red-500" : ""
                        }`}
                      />
                      {(operation.otherKwargs?.reduce_key?.length || 0) > 1 && (
                        <Button
                          onClick={() => {
                            const newKeys = [
                              ...(operation.otherKwargs?.reduce_key || [""]),
                            ];
                            newKeys.splice(index, 1);
                            handleReduceKeysChange(newKeys);
                          }}
                          size="sm"
                          variant="ghost"
                          className="absolute right-0 top-0 h-full"
                        >
                          <X size={12} />
                        </Button>
                      )}
                    </div>
                    {!key.trim() && (
                      <p className="text-red-500 text-sm mt-1">
                        必须设置归约键；若要将所有文档归为一组，请使用 “_all”。
                      </p>
                    )}
                  </div>
                )
              )}
              <Button
                onClick={() => {
                  const newKeys = [
                    ...(operation.otherKwargs?.reduce_key || [""]),
                    "",
                  ];
                  handleReduceKeysChange(newKeys);
                }}
                size="sm"
                variant="outline"
                className="flex-shrink-0"
              >
                <Plus size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>
      <PromptInput
        prompt={operation.prompt || ""}
        onChange={handlePromptChange}
      />
      <OutputSchema
        schema={schemaItems}
        onUpdate={handleSchemaUpdate}
        isExpanded={isSchemaExpanded}
        onToggle={onToggleSchema}
      />
    </>
  );
};

export const ResolveOperationComponent: React.FC<OperationComponentProps> = ({
  operation,
  isSchemaExpanded,
  onUpdate,
  onToggleSchema,
}) => {
  const schemaItems = useMemo(() => {
    return operation?.output?.schema || [];
  }, [operation?.output?.schema]);

  const handleComparisonPromptChange = (newPrompt: string) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        comparison_prompt: newPrompt,
      },
    });
  };

  const handleResolutionPromptChange = (newPrompt: string) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        resolution_prompt: newPrompt,
      },
    });
  };

  const handleSchemaUpdate = (newSchema: SchemaItem[]) => {
    onUpdate({
      ...operation,
      output: {
        ...operation.output,
        schema: newSchema,
      },
    });
  };

  return (
    <>
      <div className="flex mb-4 space-x-4">
        <div className="flex-1">
          <label
            htmlFor="comparison-prompt"
            className="block text-sm font-medium text-gray-700"
          >
            对比提示词
          </label>
          <PromptInput
            prompt={operation.otherKwargs?.comparison_prompt || ""}
            onChange={handleComparisonPromptChange}
          />
        </div>
        <div className="flex-1">
          <label
            htmlFor="resolution-prompt"
            className="block text-sm font-medium text-gray-700"
          >
            消歧提示词
          </label>
          <PromptInput
            prompt={operation.otherKwargs?.resolution_prompt || ""}
            onChange={handleResolutionPromptChange}
          />
        </div>
      </div>
      <div className="mb-4 flex items-end space-x-4">
        <div className="w-1/3">
          <div className="flex items-center">
            <label
              htmlFor="blocking-threshold"
              className="block text-sm font-medium text-gray-700"
            >
              阻塞阈值
            </label>
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <div className="ml-2">
                    <Info className="h-4 w-4 text-gray-400 cursor-help" />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="w-64 p-2 text-xs">
                  不确定填什么值？点击闪电按钮优化该操作，系统会自动确定阻塞阈值。
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            type="number"
            id="blocking-threshold"
            value={operation.otherKwargs?.blocking_threshold}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              if (!isNaN(value) && value >= 0 && value <= 1) {
                onUpdate({
                  ...operation,
                  otherKwargs: {
                    ...operation.otherKwargs,
                    blocking_threshold: value,
                  },
                });
              }
            }}
            step="0.01"
            min="0"
            max="1"
            className="mt-1"
          />
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          阻塞字段
        </label>
        <div className="flex flex-wrap gap-2">
          {(operation.otherKwargs?.blocking_keys || []).map(
            (key: string, index: number) => (
              <div key={index} className="flex items-center">
                <Input
                  value={key}
                  onChange={(e) => {
                    const newKeys = [
                      ...(operation.otherKwargs?.blocking_keys || []),
                    ];
                    newKeys[index] = e.target.value;
                    onUpdate({
                      ...operation,
                      otherKwargs: {
                        ...operation.otherKwargs,
                        blocking_keys: newKeys,
                      },
                    });
                  }}
                  placeholder="请输入阻塞字段"
                  className="w-40"
                />
                <Button
                  onClick={() => {
                    const newKeys = [
                      ...(operation.otherKwargs?.blocking_keys || []),
                    ];
                    newKeys.splice(index, 1);
                    onUpdate({
                      ...operation,
                      otherKwargs: {
                        ...operation.otherKwargs,
                        blocking_keys: newKeys,
                      },
                    });
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <X size={12} />
                </Button>
              </div>
            )
          )}
          <Button
            onClick={() => {
              const newKeys = [
                ...(operation.otherKwargs?.blocking_keys || []),
                "",
              ];
              onUpdate({
                ...operation,
                otherKwargs: {
                  ...operation.otherKwargs,
                  blocking_keys: newKeys,
                },
              });
            }}
            size="sm"
            variant="outline"
          >
            <Plus size={16} />
          </Button>
        </div>
      </div>
      <OutputSchema
        schema={schemaItems}
        onUpdate={handleSchemaUpdate}
        isExpanded={isSchemaExpanded}
        onToggle={onToggleSchema}
      />
    </>
  );
};

export const SplitOperationComponent: React.FC<OperationComponentProps> = ({
  operation,
  isSchemaExpanded,
  onUpdate,
  onToggleSchema,
}) => {
  const handleSplitKeyChange = (newSplitKey: string) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        split_key: newSplitKey,
      },
    });
  };

  const handleMethodChange = (newMethod: string) => {
    const newMethodKwargs = { ...operation.otherKwargs?.method_kwargs };
    if (newMethod === "delimiter" && !newMethodKwargs.delimiter) {
      newMethodKwargs.delimiter = "";
    } else if (newMethod === "token_count" && !newMethodKwargs.num_tokens) {
      newMethodKwargs.num_tokens = 1;
    }

    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        method: newMethod,
        method_kwargs: newMethodKwargs,
      },
    });
  };

  const handleMethodKwargsChange = (key: string, value: string) => {
    let newValue: string | number = value;
    if (key === "num_tokens") {
      const numTokens = parseInt(value, 10);
      newValue = isNaN(numTokens) || numTokens <= 0 ? 1 : numTokens;
    }
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        method_kwargs: {
          ...operation.otherKwargs?.method_kwargs,
          [key]: newValue,
        },
      },
    });
  };

  const addMethodKwarg = () => {
    const newKey = `arg${
      Object.keys(operation.otherKwargs?.method_kwargs || {}).length + 1
    }`;
    handleMethodKwargsChange(newKey, "");
  };

  const removeMethodKwarg = (keyToRemove: string) => {
    const newMethodKwargs = { ...operation.otherKwargs?.method_kwargs };
    delete newMethodKwargs[keyToRemove];

    // Ensure required kwargs are present
    if (
      operation.otherKwargs?.method === "delimiter" &&
      !newMethodKwargs.delimiter
    ) {
      newMethodKwargs.delimiter = "";
    } else if (
      operation.otherKwargs?.method === "token_count" &&
      !newMethodKwargs.num_tokens
    ) {
      newMethodKwargs.num_tokens = 1;
    }

    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        method_kwargs: newMethodKwargs,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Label htmlFor="split-key" className="w-24">
          拆分键
        </Label>
        <Input
          id="split-key"
          value={operation.otherKwargs?.split_key || ""}
          onChange={(e) => handleSplitKeyChange(e.target.value)}
          className="w-64"
        />
      </div>
      <div className="flex items-center gap-4">
        <Label htmlFor="method" className="w-24">
          方法
        </Label>
        <Select
          onValueChange={handleMethodChange}
          value={operation.otherKwargs?.method || ""}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="选择方法" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="delimiter">分隔符</SelectItem>
            <SelectItem value="token_count">Token 数</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-4">
        <Label className="w-24">方法参数</Label>
        <div className="flex-1 space-y-2">
          {Object.entries(operation.otherKwargs?.method_kwargs || {}).map(
            ([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <Input
                  value={key}
                  onChange={(e) => {
                    const newKwargs = {
                      ...operation.otherKwargs?.method_kwargs,
                    };
                    delete newKwargs[key];
                    newKwargs[e.target.value] = value;
                    onUpdate({
                      ...operation,
                      otherKwargs: {
                        ...operation.otherKwargs,
                        method_kwargs: newKwargs,
                      },
                    });
                  }}
                  className="w-1/3"
                  readOnly={
                    (operation.otherKwargs?.method === "delimiter" &&
                      key === "delimiter") ||
                    (operation.otherKwargs?.method === "token_count" &&
                      key === "num_tokens")
                  }
                />
                <Input
                  value={value as string}
                  onChange={(e) =>
                    handleMethodKwargsChange(key, e.target.value)
                  }
                  className="w-1/3"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeMethodKwarg(key)}
                  disabled={
                    (operation.otherKwargs?.method === "delimiter" &&
                      key === "delimiter") ||
                    (operation.otherKwargs?.method === "token_count" &&
                      key === "num_tokens")
                  }
                >
                  <X size={16} />
                </Button>
              </div>
            )
          )}
          <Button size="sm" variant="outline" onClick={addMethodKwarg}>
            <Plus size={16} className="mr-2" /> 添加参数
          </Button>
        </div>
      </div>
    </div>
  );
};

export const UnnestOperationComponent: React.FC<OperationComponentProps> = ({
  operation,
  onUpdate,
}) => {
  const handleUnnestKeyChange = (value: string) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        unnest_key: value,
      },
    });
  };

  const handleRecursiveChange = (checked: boolean) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        recursive: checked,
      },
    });
  };

  const handleDepthChange = (value: number) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        depth: value,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <div className="w-1/2">
          <Label htmlFor="unnest-key" className="text-sm font-medium">
            展开键
          </Label>
          <Input
            id="unnest-key"
            value={operation.otherKwargs?.unnest_key || ""}
            onChange={(e) => handleUnnestKeyChange(e.target.value)}
            placeholder="请输入用于展开文档的字段"
            className="mt-1"
          />
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Label
            htmlFor="recursive"
            className="text-sm font-medium cursor-pointer"
          >
            递归
          </Label>
          <Checkbox
            id="recursive"
            checked={operation.otherKwargs?.recursive || false}
            onCheckedChange={handleRecursiveChange}
          />
        </div>
        <div className="flex items-center space-x-2">
          <Label htmlFor="depth" className="text-sm font-medium">
            深度
          </Label>
          <Input
            id="depth"
            type="number"
            value={operation.otherKwargs?.depth || ""}
            onChange={(e) => handleDepthChange(Number(e.target.value))}
            placeholder="最大深度"
            className="w-32"
          />
        </div>
      </div>
    </div>
  );
};

export const GatherOperationComponent: React.FC<OperationComponentProps> = ({
  operation,
  onUpdate,
  isSchemaExpanded,
  onToggleSchema,
}) => {
  const handleInputChange = (key: string, value: string) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        [key]: value || undefined,
      },
    });
  };

  const handlePeripheralChunksChange = (
    section: "previous" | "next",
    subsection: "head" | "middle" | "tail",
    key: string,
    value: any
  ) => {
    const updatedPeripheralChunks = {
      ...(operation.otherKwargs?.peripheral_chunks || {}),
      [section]: {
        ...(operation.otherKwargs?.peripheral_chunks?.[section] || {}),
        [subsection]: {
          ...(operation.otherKwargs?.peripheral_chunks?.[section]?.[
            subsection
          ] || {}),
          [key]: value || undefined,
        },
      },
    };

    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        peripheral_chunks: updatedPeripheralChunks,
      },
    });
  };

  const chunkLabels: Record<"head" | "middle" | "tail", string> = {
    head: "开头",
    middle: "中间",
    tail: "结尾",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <div className="w-1/3">
          <div className="flex items-center space-x-2">
            <Label htmlFor="content-key" className="text-sm font-medium">
              内容字段
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-gray-500" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    在 split 操作使用的 split_key 后追加 _chunk
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id="content-key"
            value={operation.otherKwargs?.content_key || ""}
            onChange={(e) => handleInputChange("content_key", e.target.value)}
            placeholder="请输入内容字段"
            className="mt-1"
          />
        </div>
        <div className="w-1/3">
          <div className="flex items-center space-x-2">
            <Label htmlFor="doc-id-key" className="text-sm font-medium">
              文档 ID 字段
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-gray-500" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    在已定义的 split 操作名称后追加 _id
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id="doc-id-key"
            value={operation.otherKwargs?.doc_id_key || ""}
            onChange={(e) => handleInputChange("doc_id_key", e.target.value)}
            placeholder="请输入文档 ID 字段"
            className="mt-1"
          />
        </div>
        <div className="w-1/3">
          <div className="flex items-center space-x-2">
            <Label htmlFor="order-key" className="text-sm font-medium">
              顺序字段
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-gray-500" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    在已定义的 split 操作名称后追加 _chunk_num
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id="order-key"
            value={operation.otherKwargs?.order_key || ""}
            onChange={(e) => handleInputChange("order_key", e.target.value)}
            placeholder="请输入顺序字段"
            className="mt-1"
          />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Label className="text-sm font-medium">前后文片段</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-4 w-4 text-gray-500" />
              </TooltipTrigger>
              <TooltipContent>
                <p>注意：可留空以不包含上下文</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex space-x-4">
          <div className="w-1/2 space-y-2">
            <Label className="text-sm font-medium">前文</Label>
            <div className="pl-4 space-y-2">
              {["head", "middle", "tail"].map((subsection) => (
                <div key={subsection} className="flex items-center space-x-2">
                  <Label className="text-sm font-medium w-20">
                    {chunkLabels[subsection as "head" | "middle" | "tail"]}
                  </Label>
                  <Input
                    value={
                      operation.otherKwargs?.peripheral_chunks?.previous?.[
                        subsection
                      ]?.content_key || ""
                    }
                    onChange={(e) =>
                      handlePeripheralChunksChange(
                        "previous",
                        subsection as "head" | "middle" | "tail",
                        "content_key",
                        e.target.value
                      )
                    }
                    placeholder="内容字段"
                    className="w-40"
                  />
                  {subsection !== "middle" && (
                    <Input
                      type="number"
                      value={
                        operation.otherKwargs?.peripheral_chunks?.previous?.[
                          subsection
                        ]?.count || ""
                      }
                      onChange={(e) =>
                        handlePeripheralChunksChange(
                          "previous",
                          subsection as "head" | "middle" | "tail",
                        "count",
                        Number(e.target.value)
                      )
                    }
                      placeholder="数量"
                      className="w-20"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="w-1/2 space-y-2">
            <Label className="text-sm font-medium">后文</Label>
            <div className="pl-4 space-y-2">
              {["head", "middle", "tail"].map((subsection) => (
                <div key={subsection} className="flex items-center space-x-2">
                  <Label className="text-sm font-medium w-20">
                    {chunkLabels[subsection as "head" | "middle" | "tail"]}
                  </Label>
                  <Input
                    value={
                      operation.otherKwargs?.peripheral_chunks?.next?.[
                        subsection
                      ]?.content_key || ""
                    }
                    onChange={(e) =>
                      handlePeripheralChunksChange(
                        "next",
                        subsection as "head" | "middle" | "tail",
                        "content_key",
                        e.target.value
                      )
                    }
                    placeholder="内容字段"
                    className="w-40"
                  />
                  {subsection !== "middle" && (
                    <Input
                      type="number"
                      value={
                        operation.otherKwargs?.peripheral_chunks?.next?.[
                          subsection
                        ]?.count || ""
                      }
                      onChange={(e) =>
                        handlePeripheralChunksChange(
                          "next",
                          subsection as "head" | "middle" | "tail",
                        "count",
                        Number(e.target.value)
                      )
                    }
                      placeholder="数量"
                      className="w-20"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ParallelMapOperationComponent: React.FC<
  OperationComponentProps
> = ({ operation, onUpdate, isSchemaExpanded, onToggleSchema }) => {
  const { modelOptions } = useModelRegistry();

  const handlePromptChange = (index: number, field: string, value: string) => {
    const updatedPrompts = [...(operation.otherKwargs?.prompts || [])];
    updatedPrompts[index] = { ...updatedPrompts[index], [field]: value };

    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        prompts: updatedPrompts,
      },
    });
  };

  const handleOutputKeysChange = (
    index: number,
    action: "add" | "remove" | "update",
    value?: string,
    keyIndex?: number
  ) => {
    const updatedPrompts = [...(operation.otherKwargs?.prompts || [])];
    const currentOutputKeys = [...(updatedPrompts[index].output_keys || [])];

    if (action === "add") {
      currentOutputKeys.push("");
    } else if (action === "remove" && keyIndex !== undefined) {
      currentOutputKeys.splice(keyIndex, 1);
    } else if (
      action === "update" &&
      keyIndex !== undefined &&
      value !== undefined
    ) {
      currentOutputKeys[keyIndex] = value;
    }

    updatedPrompts[index] = {
      ...updatedPrompts[index],
      output_keys: currentOutputKeys,
    };

    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        prompts: updatedPrompts,
      },
    });
  };

  const addPrompt = () => {
    const updatedPrompts = [
      ...(operation.otherKwargs?.prompts || []),
      { prompt: "", output_keys: [], model: "" },
    ];
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        prompts: updatedPrompts,
      },
    });
  };

  const removePrompt = (index: number) => {
    const updatedPrompts = [...(operation.otherKwargs?.prompts || [])];
    updatedPrompts.splice(index, 1);
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        prompts: updatedPrompts,
      },
    });
  };

  return (
    <div className="space-y-4">
      {(operation.otherKwargs?.prompts || []).map(
        (prompt: PromptConfig, index: number) => (
          <div key={index} className="border p-2 rounded space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-sm font-medium">提示词 {index + 1}</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removePrompt(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <PromptInput
              prompt={prompt.prompt || ""}
              onChange={(value) => handlePromptChange(index, "prompt", value)}
            />
            <div className="flex items-center space-x-2">
              <div className="flex-grow">
                <Label className="text-sm font-medium">输出字段</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {prompt.output_keys?.map((key: string, keyIndex: number) => (
                    <div key={keyIndex} className="flex items-center">
                      <Input
                        value={key}
                        onChange={(e) =>
                          handleOutputKeysChange(
                            index,
                            "update",
                            e.target.value,
                            keyIndex
                          )
                        }
                        className="w-48"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          handleOutputKeysChange(
                            index,
                            "remove",
                            undefined,
                            keyIndex
                          )
                        }
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOutputKeysChange(index, "add")}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">模型</Label>
                <ModelInput
                  value={prompt.model || ""}
                  onChange={(value) => handlePromptChange(index, "model", value)}
                  placeholder="模型"
                  suggestions={modelOptions}
                  inputClassName="w-48 mt-1"
                />
              </div>
            </div>
          </div>
        )
      )}
      <Button onClick={addPrompt} size="sm">
        添加提示词
      </Button>
      <OutputSchema
        schema={operation.output?.schema || []}
        onUpdate={(newSchema) =>
          onUpdate({
            ...operation,
            output: { ...operation.output, schema: newSchema },
          })
        }
        isExpanded={isSchemaExpanded}
        onToggle={onToggleSchema}
      />
    </div>
  );
};

export const SampleOperationComponent: React.FC<OperationComponentProps> = ({
  operation,
  onUpdate,
  isSchemaExpanded,
  onToggleSchema,
}) => {
  const handleChange = (field: string, value: string | number | boolean) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        [field]: value,
      },
    });
  };

  const handleMethodKwargsChange = (
    field: string,
    value: string | number | boolean | string[]
  ) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        method_kwargs: {
          ...operation.otherKwargs?.method_kwargs,
          [field]: value,
        },
      },
    });
  };

  return (
    <div className="space-y-4 mb-2">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="method">方法</Label>
          <Select
            value={operation.otherKwargs?.method || ""}
            onValueChange={(value) => handleChange("method", value)}
          >
            <SelectTrigger id="method">
              <SelectValue placeholder="选择方法" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="uniform">均匀</SelectItem>
              <SelectItem value="stratify">分层</SelectItem>
              <SelectItem value="outliers">异常值</SelectItem>
              <SelectItem value="custom">自定义</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="samples">样本数</Label>
          {operation.otherKwargs?.method === "custom" ? (
            <Textarea
              id="samples"
              value={operation.otherKwargs?.samples || ""}
              onChange={(e) => handleChange("samples", e.target.value)}
              placeholder="请输入 JSON 键值对"
              className={`font-mono ${(() => {
                try {
                  const value = operation.otherKwargs?.samples;
                  if (!value) return "";
                  const parsed = JSON.parse(value);
                  if (
                    !Array.isArray(parsed) ||
                    !parsed.every((item) => typeof item === "object")
                  ) {
                    return "border-red-500";
                  }
                  return "";
                } catch {
                  return "border-red-500";
                }
              })()}`}
            />
          ) : (
            <Input
              id="samples"
              type="text"
              value={operation.otherKwargs?.samples || ""}
              onChange={(e) => handleChange("samples", e.target.value)}
              placeholder="样本数量或比例"
            />
          )}
        </div>
      </div>
      {operation.otherKwargs?.method === "stratify" && (
        <div>
          <Label htmlFor="stratify_key">分层字段</Label>
          <Input
            id="stratify_key"
            type="text"
            value={operation.otherKwargs?.method_kwargs?.stratify_key || ""}
            onChange={(e) =>
              handleMethodKwargsChange("stratify_key", e.target.value)
            }
            placeholder="用于分层的字段"
          />
        </div>
      )}
      {operation.otherKwargs?.method === "outliers" && (
        <>
          <div>
            <Label htmlFor="embedding_keys">嵌入字段</Label>
            <Input
              id="embedding_keys"
              type="text"
              value={
                operation.otherKwargs?.method_kwargs?.embedding_keys?.join(
                  ", "
                ) || ""
              }
              onChange={(e) =>
                handleMethodKwargsChange(
                  "embedding_keys",
                  e.target.value.split(", ")
                )
              }
              placeholder="用逗号分隔的字段列表"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="std">标准差倍数</Label>
              <Input
                id="std"
                type="number"
                value={operation.otherKwargs?.method_kwargs?.std || ""}
                onChange={(e) =>
                  handleMethodKwargsChange("std", parseFloat(e.target.value))
                }
                placeholder="标准差倍数"
              />
            </div>
            <div>
              <Label htmlFor="keep">保留异常值</Label>
              <Select
                value={
                  operation.otherKwargs?.method_kwargs?.keep?.toString() || ""
                }
                onValueChange={(value) =>
                  handleMethodKwargsChange("keep", value === "true")
                }
              >
                <SelectTrigger id="keep">
                  <SelectValue placeholder="选择选项" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">保留</SelectItem>
                  <SelectItem value="false">移除</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const RankOperationComponent: React.FC<OperationComponentProps> = ({
  operation,
  onUpdate,
  isSchemaExpanded,
  onToggleSchema,
}) => {
  const handlePromptChange = (newPrompt: string) => {
    onUpdate({ ...operation, prompt: newPrompt });
  };

  const handleDirectionChange = (direction: string) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        direction: direction,
      },
    });
  };

  const handleRerankCallBudgetChange = (value: string) => {
    const numValue = parseInt(value);
    // Only update if it's a valid number
    if (!isNaN(numValue) && numValue > 0) {
      onUpdate({
        ...operation,
        otherKwargs: {
          ...operation.otherKwargs,
          rerank_call_budget: numValue,
        },
      });
    }
  };

  const handleInputKeysChange = (newInputKeys: string[]) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        input_keys: newInputKeys,
      },
    });
  };

  // Initialize with default values if they don't exist
  useEffect(() => {
    const updateIfMissing = {};

    if (!operation.otherKwargs?.direction) {
      updateIfMissing["direction"] = "desc";
    }

    if (!operation.otherKwargs?.rerank_call_budget) {
      updateIfMissing["rerank_call_budget"] = 10;
    }

    if (!operation.otherKwargs?.input_keys) {
      updateIfMissing["input_keys"] = [];
    }

    if (Object.keys(updateIfMissing).length > 0) {
      onUpdate({
        ...operation,
        otherKwargs: {
          ...operation.otherKwargs,
          ...updateIfMissing,
        },
      });
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <Label
          htmlFor="sorting-criteria"
          className="text-sm font-medium mb-1 block"
        >
          排序规则
        </Label>
        <PromptInput
          prompt={operation.prompt || ""}
          onChange={handlePromptChange}
          disableValidation={true}
          placeholder="描述排序依据（例如：按候选人在辩论中的攻击性排序）"
        />
      </div>

      <div className="mb-4">
        <div className="flex items-center space-x-2">
          <Label htmlFor="input-keys" className="text-sm font-medium">
            输入字段
          </Label>
          <HoverCard>
            <HoverCardTrigger>
              <Info size={16} className="text-primary cursor-help" />
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-2">
                <h4 className="font-medium">输入字段</h4>
                <p className="text-sm text-muted-foreground">
                  指定用于排序的文档字段，LLM 将基于这些字段进行比较排序。
                </p>
                <div className="mt-2 rounded-md bg-muted p-2">
                  <p className="text-sm font-medium">示例：</p>
                  <p className="text-xs text-muted-foreground">
                    辩论排序可包含 &quot;content&quot; 与 &quot;title&quot; 等字段。
                  </p>
                </div>
                <p className="text-xs text-gray-600 font-medium mt-1">
                  注意：排序只会使用这些字段进行比较。
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
        <div className="flex flex-wrap gap-2 mt-1">
          {(operation.otherKwargs?.input_keys || []).map((key, index) => (
            <div key={index} className="flex items-center">
              <Input
                value={key}
                onChange={(e) => {
                  const newKeys = [
                    ...(operation.otherKwargs?.input_keys || []),
                  ];
                  newKeys[index] = e.target.value;
                  handleInputKeysChange(newKeys);
                }}
                className={`w-40 ${
                  !key.trim() ? "border-red-500 focus:ring-red-500" : ""
                }`}
                placeholder="请输入输入字段"
              />
              {(operation.otherKwargs?.input_keys?.length || 0) > 1 && (
                <Button
                  onClick={() => {
                    const newKeys = [
                      ...(operation.otherKwargs?.input_keys || []),
                    ];
                    newKeys.splice(index, 1);
                    handleInputKeysChange(newKeys);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <X size={12} />
                </Button>
              )}
            </div>
          ))}
          <Button
            onClick={() => {
              const newKeys = [
                ...(operation.otherKwargs?.input_keys || []),
                "",
              ];
              handleInputKeysChange(newKeys);
            }}
            size="sm"
            variant="outline"
          >
            <Plus size={16} />
          </Button>
        </div>
        {(!operation.otherKwargs?.input_keys ||
          operation.otherKwargs.input_keys.length === 0 ||
          operation.otherKwargs.input_keys.some((key) => !key.trim())) && (
          <div className="text-red-500 text-sm mt-1">
            排序至少需要一个非空输入字段
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6" style={{ maxWidth: "500px" }}>
        <div>
          <Label htmlFor="direction" className="text-sm font-medium block mb-2">
            方向
          </Label>
          <Select
            value={operation.otherKwargs?.direction || "desc"}
            onValueChange={handleDirectionChange}
          >
            <SelectTrigger id="direction">
              <SelectValue placeholder="选择方向" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">升序</SelectItem>
              <SelectItem value="desc">降序</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center mb-2">
            <Label htmlFor="rerank-call-budget" className="text-sm font-medium">
              重排调用上限
            </Label>
            <HoverCard>
              <HoverCardTrigger>
                <Info size={16} className="text-primary cursor-help ml-2" />
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <div className="space-y-2">
                  <h4 className="font-medium">重排调用上限</h4>
                  <p className="text-sm text-muted-foreground">
                    排序精修阶段允许的 LLM 调用最大次数。
                  </p>
                  <div className="mt-2 rounded-md bg-muted p-2">
                    <p className="text-sm font-medium">工作方式：</p>
                    <p className="text-xs text-muted-foreground">
                      排序先做一次初排，再使用滑动窗口进行精修。本参数限制精修阶段的
                      LLM 调用次数。
                    </p>
                  </div>
                  <p className="text-xs text-gray-600 font-medium mt-1">
                    注意：值越大，排序更准确但成本更高。
                  </p>
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>
          <Input
            id="rerank-call-budget"
            type="number"
            value={operation.otherKwargs?.rerank_call_budget || 10}
            onChange={(e) => handleRerankCallBudgetChange(e.target.value)}
            min="1"
            placeholder="默认：10"
          />
        </div>
      </div>
    </div>
  );
};

export const ExtractOperationComponent: React.FC<OperationComponentProps> = ({
  operation,
  onUpdate,
  isSchemaExpanded,
  onToggleSchema,
}) => {
  const handlePromptChange = (newPrompt: string) => {
    onUpdate({ ...operation, prompt: newPrompt });
  };

  const handleDocumentKeysChange = (newDocumentKeys: string[]) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        document_keys: newDocumentKeys,
      },
    });
  };

  const handleExtractionMethodChange = (method: string) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        extraction_method: method,
      },
    });
  };

  const handleFormatExtractionChange = (value: boolean) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        format_extraction: value,
      },
    });
  };

  // Initialize with default values if they don't exist
  useEffect(() => {
    const updateIfMissing = {};

    if (!operation.otherKwargs?.document_keys) {
      updateIfMissing["document_keys"] = [];
    }

    if (operation.otherKwargs?.extraction_method === undefined) {
      updateIfMissing["extraction_method"] = "line_number";
    }

    if (operation.otherKwargs?.format_extraction === undefined) {
      updateIfMissing["format_extraction"] = true;
    }

    if (Object.keys(updateIfMissing).length > 0) {
      onUpdate({
        ...operation,
        otherKwargs: {
          ...operation.otherKwargs,
          ...updateIfMissing,
        },
      });
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="mb-4">
        <Label
          htmlFor="extract-prompt"
          className="text-sm font-medium mb-1 block"
        >
          抽取提示词
        </Label>
        <PromptInput
          prompt={operation.prompt || ""}
          onChange={handlePromptChange}
          disableValidation={true}
          placeholder="例如：抽取论文中描述实验结果的部分"
        />
      </div>

      <div className="mb-4">
        <div className="flex items-center space-x-2">
          <Label htmlFor="document-keys" className="text-sm font-medium">
            文档字段
          </Label>
          <HoverCard>
            <HoverCardTrigger>
              <Info size={16} className="text-primary cursor-help" />
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-2">
                <h4 className="font-medium">文档字段</h4>
                <p className="text-sm text-muted-foreground">
                  指定包含待抽取文本的字段。抽取结果会写入新的字段，
                  字段名后缀为 "_extracted_{operation.name}"。
                </p>
                <div className="mt-2 rounded-md bg-muted p-2">
                  <p className="text-sm font-medium">示例：</p>
                  <p className="text-xs text-muted-foreground">
                    如果文档中有 &quot;content&quot; 字段包含待抽取文本，
                    请在此填写 &quot;content&quot;。
                  </p>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
        <div className="flex flex-wrap gap-2 mt-1">
          {(operation.otherKwargs?.document_keys || []).map((key, index) => (
            <div key={index} className="flex items-center">
              <Input
                value={key}
                onChange={(e) => {
                  const newKeys = [
                    ...(operation.otherKwargs?.document_keys || []),
                  ];
                  newKeys[index] = e.target.value;
                  handleDocumentKeysChange(newKeys);
                }}
                className={`w-40 ${
                  !key.trim() ? "border-red-500 focus:ring-red-500" : ""
                }`}
                placeholder="请输入文档字段"
              />
              {(operation.otherKwargs?.document_keys?.length || 0) > 1 && (
                <Button
                  onClick={() => {
                    const newKeys = [
                      ...(operation.otherKwargs?.document_keys || []),
                    ];
                    newKeys.splice(index, 1);
                    handleDocumentKeysChange(newKeys);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <X size={12} />
                </Button>
              )}
            </div>
          ))}
          <Button
            onClick={() => {
              const newKeys = [
                ...(operation.otherKwargs?.document_keys || []),
                "",
              ];
              handleDocumentKeysChange(newKeys);
            }}
            size="sm"
            variant="outline"
          >
            <Plus size={16} />
          </Button>
        </div>
        {(!operation.otherKwargs?.document_keys ||
          operation.otherKwargs.document_keys.length === 0 ||
          operation.otherKwargs.document_keys.some((key) => !key.trim())) && (
          <div className="text-red-500 text-sm mt-1">
            抽取至少需要一个非空文档字段
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <Label
            htmlFor="extraction-method"
            className="text-sm font-medium block mb-2"
          >
            抽取方法
          </Label>
          <Select
            value={operation.otherKwargs?.extraction_method || "line_number"}
            onValueChange={handleExtractionMethodChange}
          >
            <SelectTrigger id="extraction-method">
              <SelectValue placeholder="选择抽取方式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="line_number">行号</SelectItem>
              <SelectItem value="regex">正则</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            行号适合段落/章节抽取；正则适合结构化数据（如日期、数字）。
          </p>
        </div>

        <div>
          <Label
            htmlFor="format-extraction"
            className="text-sm font-medium block mb-2"
          >
            格式化抽取
          </Label>
          <Select
            value={
              (operation.otherKwargs?.format_extraction?.toString() as
                | "true"
                | "false") || "true"
            }
            onValueChange={(value) =>
              handleFormatExtractionChange(value === "true")
            }
          >
            <SelectTrigger id="format-extraction">
              <SelectValue placeholder="选择格式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">字符串（换行拼接）</SelectItem>
              <SelectItem value="false">
                列表（保持为独立项）
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            字符串适合合并展示，列表适合逐条处理抽取结果。
          </p>
        </div>
      </div>
    </div>
  );
};

export const CodeOperationComponent: React.FC<OperationComponentProps> = ({
  operation,
  onUpdate,
}) => {
  useEffect(() => {
    if (
      operation.type === "code_reduce" &&
      !operation.otherKwargs?.reduce_key
    ) {
      handleReduceKeysChange(["_all"]);
    }
  }, []);

  const handleCodeChange = (newCode: string) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        code: newCode,
      },
    });
  };

  const handleReduceKeysChange = (newReduceKeys: string[]) => {
    onUpdate({
      ...operation,
      otherKwargs: {
        ...operation.otherKwargs,
        reduce_key: newReduceKeys,
      },
    });
  };

  return (
    <div className="space-y-4">
      {operation.type === "code_reduce" && (
        <div className="mb-4">
          <div className="flex items-center space-x-2">
            <Label htmlFor="reduce-keys" className="w-1/4">
              归约键
            </Label>
            <div className="flex-grow flex items-center space-x-2 overflow-x-auto">
              <div className="flex-nowrap flex items-center space-x-2">
                {(operation.otherKwargs?.reduce_key || [""]).map(
                  (key: string, index: number) => (
                    <div
                      key={index}
                      className="relative flex-shrink-0"
                      style={{ minWidth: "150px" }}
                    >
                      <div className="flex items-center">
                        <Input
                          id={`reduce-key-${index}`}
                          value={key}
                          onChange={(e) => {
                            const newKeys = [
                              ...(operation.otherKwargs?.reduce_key || [""]),
                            ];
                            newKeys[index] = e.target.value;
                            handleReduceKeysChange(newKeys);
                          }}
                          placeholder="请输入归约键"
                          className={`w-full pr-8 ${
                            !key.trim()
                              ? "border-red-500 focus:ring-red-500"
                              : ""
                          }`}
                        />
                        {(operation.otherKwargs?.reduce_key?.length || 0) >
                          1 && (
                          <Button
                            onClick={() => {
                              const newKeys = [
                                ...(operation.otherKwargs?.reduce_key || [""]),
                              ];
                              newKeys.splice(index, 1);
                              handleReduceKeysChange(newKeys);
                            }}
                            size="sm"
                            variant="ghost"
                            className="absolute right-0 top-0 h-full"
                          >
                            <X size={12} />
                          </Button>
                        )}
                      </div>
                      {!key.trim() && (
                        <p className="text-red-500 text-sm mt-1">
                          必须设置归约键；若要将所有文档归为一组，请使用 “_all”。
                        </p>
                      )}
                    </div>
                  )
                )}
                <Button
                  onClick={() => {
                    const newKeys = [
                      ...(operation.otherKwargs?.reduce_key || [""]),
                      "",
                    ];
                    handleReduceKeysChange(newKeys);
                  }}
                  size="sm"
                  variant="outline"
                  className="flex-shrink-0"
                >
                  <Plus size={16} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div>
        <CodeInput
          code={operation.otherKwargs?.code || ""}
          operationType={
            operation.type as "code_map" | "code_reduce" | "code_filter"
          }
          onChange={handleCodeChange}
        />
      </div>
    </div>
  );
};

export default function createOperationComponent(
  operation: Operation,
  onUpdate: (updatedOperation: Operation) => void,
  isSchemaExpanded: boolean,
  onToggleSchema: () => void
) {
  switch (operation.type) {
    case "reduce":
      return (
        <ReduceOperationComponent
          operation={operation}
          onUpdate={onUpdate}
          isSchemaExpanded={isSchemaExpanded}
          onToggleSchema={onToggleSchema}
        />
      );
    case "map":
    case "filter":
      return (
        <MapFilterOperationComponent
          operation={operation}
          onUpdate={onUpdate}
          isSchemaExpanded={isSchemaExpanded}
          onToggleSchema={onToggleSchema}
        />
      );
    case "resolve":
      return (
        <ResolveOperationComponent
          operation={operation}
          onUpdate={onUpdate}
          isSchemaExpanded={isSchemaExpanded}
          onToggleSchema={onToggleSchema}
        />
      );
    case "parallel_map":
      return (
        <ParallelMapOperationComponent
          operation={operation}
          onUpdate={onUpdate}
          isSchemaExpanded={isSchemaExpanded}
          onToggleSchema={onToggleSchema}
        />
      );
    case "unnest":
      return (
        <UnnestOperationComponent
          operation={operation}
          onUpdate={onUpdate}
          isSchemaExpanded={isSchemaExpanded}
          onToggleSchema={onToggleSchema}
        />
      );
    case "split":
      return (
        <SplitOperationComponent
          operation={operation}
          onUpdate={onUpdate}
          isSchemaExpanded={isSchemaExpanded}
          onToggleSchema={onToggleSchema}
        />
      );
    case "gather":
      return (
        <GatherOperationComponent
          operation={operation}
          onUpdate={onUpdate}
          isSchemaExpanded={isSchemaExpanded}
          onToggleSchema={onToggleSchema}
        />
      );
    case "sample":
      return (
        <SampleOperationComponent
          operation={operation}
          onUpdate={onUpdate}
          isSchemaExpanded={isSchemaExpanded}
          onToggleSchema={onToggleSchema}
        />
      );
    case "rank":
      return (
        <RankOperationComponent
          operation={operation}
          onUpdate={onUpdate}
          isSchemaExpanded={isSchemaExpanded}
          onToggleSchema={onToggleSchema}
        />
      );
    case "extract":
      return (
        <ExtractOperationComponent
          operation={operation}
          onUpdate={onUpdate}
          isSchemaExpanded={isSchemaExpanded}
          onToggleSchema={onToggleSchema}
        />
      );
    case "code_map":
    case "code_reduce":
    case "code_filter":
      return (
        <CodeOperationComponent
          operation={operation}
          onUpdate={onUpdate}
          isSchemaExpanded={isSchemaExpanded}
          onToggleSchema={onToggleSchema}
        />
      );
    default:
      console.warn(`Unsupported operation type: ${operation.type}`);
      return null;
  }
}
