import React from "react";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Trash2, Plus, ChevronDown, Info, Maximize2 } from "lucide-react";
import { SchemaItem, SchemaType } from "@/app/types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { Label } from "../ui/label";
import Editor from "@monaco-editor/react";
import PropTypes from "prop-types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";

interface PromptInputProps {
  prompt: string;
  onChange: (value: string) => void;
  disableValidation?: boolean;
  placeholder?: string;
}

export const PromptInput: React.FC<PromptInputProps> = React.memo(
  ({
    prompt,
    onChange,
    disableValidation = false,
    placeholder = "输入提示词（必须是 Jinja2 模板）",
  }) => {
    const validateJinjaTemplate = (value: string) => {
      if (disableValidation) return true;
      const hasOpenBrace = value.includes("{{");
      const hasCloseBrace = value.includes("}}");
      return hasOpenBrace && hasCloseBrace;
    };

    return (
      <>
        <Textarea
          placeholder={placeholder}
          className={`mb-1 rounded-sm text-sm font-mono ${
            !validateJinjaTemplate(prompt) ? "border-red-500" : ""
          }`}
          rows={Math.max(3, Math.ceil(prompt.split("\n").length))}
          value={prompt}
          onChange={(e) => onChange(e.target.value)}
        />
        {!validateJinjaTemplate(prompt) && (
          <div className="text-red-500 text-sm mb-1">
            提示词必须包含 Jinja2 模板语法 {"{"}
            {"{"} 和 {"}"}
            {"}"}
          </div>
        )}
      </>
    );
  }
);

PromptInput.displayName = "PromptInput";

PromptInput.propTypes = {
  prompt: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  disableValidation: PropTypes.bool,
  placeholder: PropTypes.string,
};

interface SchemaFormProps {
  schema: SchemaItem[];
  onUpdate: (newSchema: SchemaItem[]) => void;
  level?: number;
  isList?: boolean;
}

export const SchemaForm: React.FC<SchemaFormProps> = React.memo(
  ({ schema, onUpdate, level = 0, isList = false }) => {
    const addItem = () => {
      if (isList) return;
      onUpdate([...schema, { key: "", type: "string" }]);
    };

    const updateItem = (index: number, item: SchemaItem) => {
      const newSchema = [...schema];
      newSchema[index] = item;
      onUpdate(newSchema);
    };

    const removeItem = (index: number) => {
      if (isList) return;
      const newSchema = schema.filter((_, i) => i !== index);
      onUpdate(newSchema);
    };

    return (
      <div style={{ marginLeft: `${level * 20}px` }}>
        {schema.map((item, index) => (
          <div
            key={index}
            className="flex flex-wrap items-center space-x-2 mb-1"
          >
            {!isList && (
              <Input
                value={item.key}
                onChange={(e) =>
                  updateItem(index, { ...item, key: e.target.value })
                }
                placeholder="键"
                className={`w-1/3 min-w-[150px] ${
                  !item.key ? "border-red-500" : ""
                }`}
              />
            )}
            <Select
              value={item.type}
              onValueChange={(value: SchemaType) => {
                updateItem(index, {
                  ...item,
                  type: value,
                  subType:
                    value === "list"
                      ? { key: "0", type: "string" }
                      : value === "dict"
                      ? [{ key: "", type: "string" }]
                      : undefined,
                  enumValues: value === "enum" ? ["", ""] : undefined,
                });
              }}
            >
              <SelectTrigger className={`w-32 ${isList ? "flex-grow" : ""}`}>
                <SelectValue placeholder="类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">字符串</SelectItem>
                <SelectItem value="float">浮点</SelectItem>
                <SelectItem value="int">整数</SelectItem>
                <SelectItem value="boolean">布尔</SelectItem>
                <SelectItem value="list">列表</SelectItem>
                <SelectItem value="dict">字典</SelectItem>
                <SelectItem value="enum">枚举</SelectItem>
              </SelectContent>
            </Select>
            {!isList && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeItem(index)}
                className="p-1"
              >
                <Trash2 size={16} />
              </Button>
            )}
            {item.type === "enum" && (
              <div className="w-full mt-1 ml-4">
                <Label className="text-sm text-gray-500 mb-1">
                  枚举值
                </Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 overflow-x-auto flex items-center gap-2 pb-2">
                    {(item.enumValues || ["", ""]).map((value, enumIndex) => (
                      <div
                        key={enumIndex}
                        className="flex-none flex items-center gap-1"
                      >
                        <Input
                          value={value}
                          onChange={(e) => {
                            const newValues = [
                              ...(item.enumValues || ["", ""]),
                            ];
                            newValues[enumIndex] = e.target.value;
                            updateItem(index, {
                              ...item,
                              enumValues: newValues,
                            });
                          }}
                          placeholder={`值${enumIndex + 1}`}
                          className={`w-32 ${!value ? "border-red-500" : ""}`}
                        />
                        {item.enumValues && item.enumValues.length > 2 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const newValues = item.enumValues?.filter(
                                (_, i) => i !== enumIndex
                              );
                              updateItem(index, {
                                ...item,
                                enumValues: newValues,
                              });
                            }}
                            className="p-1 h-7 w-7 hover:bg-destructive/10"
                          >
                            <Trash2 size={14} className="text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newValues = [...(item.enumValues || ["", ""]), ""];
                      updateItem(index, {
                        ...item,
                        enumValues: newValues,
                      });
                    }}
                    className="flex-none"
                  >
                    <Plus size={16} className="mr-1" />
                    添加值
                  </Button>
                </div>
                {(!item.enumValues?.length ||
                  item.enumValues.length < 2 ||
                  item.enumValues.some((v) => !v)) && (
                  <div className="text-red-500 text-sm mt-1">
                    至少需要两个非空枚举值
                  </div>
                )}
              </div>
            )}
            {item.type === "list" && item.subType && (
              <div className="w-full mt-1 ml-4 flex items-center">
                <span className="mr-2 text-sm text-gray-500">列表类型：</span>
                <SchemaForm
                  schema={[item.subType as SchemaItem]}
                  onUpdate={(newSubSchema) =>
                    updateItem(index, { ...item, subType: newSubSchema[0] })
                  }
                  level={0}
                  isList={true}
                />
              </div>
            )}
            {item.type === "dict" && item.subType && (
              <div className="w-full mt-1 ml-4">
                <SchemaForm
                  schema={item.subType as SchemaItem[]}
                  onUpdate={(newSubSchema) =>
                    updateItem(index, { ...item, subType: newSubSchema })
                  }
                  level={level + 1}
                />
              </div>
            )}
            {!isList && !item.key && (
              <div className="w-full mt-1 text-red-500 text-sm">
                必须填写键名
              </div>
            )}
          </div>
        ))}
        {!isList && (
          <Button
            variant="outline"
            size="sm"
            onClick={addItem}
            className="mt-1"
          >
            <Plus size={16} className="mr-2" /> 添加字段
          </Button>
        )}
      </div>
    );
  }
);

SchemaForm.displayName = "SchemaForm";

SchemaForm.propTypes = {
  // @ts-expect-error - PropTypes schema doesn't match TypeScript SchemaItem[] type exactly
  schema: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string,
      type: PropTypes.oneOf([
        "string",
        "float",
        "int",
        "boolean",
        "list",
        "dict",
      ]).isRequired,
      subType: PropTypes.oneOfType([
        PropTypes.object,
        PropTypes.arrayOf(PropTypes.object),
      ]),
    })
  ).isRequired,
  onUpdate: PropTypes.func.isRequired,
  level: PropTypes.number,
  isList: PropTypes.bool,
};

interface OutputSchemaProps {
  schema: SchemaItem[];
  onUpdate: (newSchema: SchemaItem[]) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

export const OutputSchema: React.FC<OutputSchemaProps> = React.memo(
  ({ schema, onUpdate, isExpanded, onToggle }) => {
    const isEmpty = schema.length === 0;
    const hasEmptyKeys = schema.some((item) => !item.key);

    return (
      <div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className={`p-0 ${isEmpty || hasEmptyKeys ? "text-red-500" : ""}`}
          >
            <ChevronDown
              size={16}
              className={`mr-1 transition-transform duration-200 ${
                isExpanded ? "transform rotate-180" : ""
              }`}
            />
            <h4 className="text-xs font-semibold">
              输出 Schema {isEmpty && "（必填）"}
            </h4>
          </Button>
          <HoverCard>
            <HoverCardTrigger>
              <Info size={16} className="text-primary cursor-help" />
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-2">
                <h4 className="font-medium">输出列命名</h4>
                <p className="text-sm text-muted-foreground">
                  列名会影响 LLM 的输出，请合理命名。
                </p>
                <div className="mt-2 rounded-md bg-muted p-2">
                  <p className="text-sm font-medium">示例：</p>
                  <p className="text-xs text-muted-foreground">
                    如果提示词用于抽取姓名，建议使用 &quot;names&quot; 作为输出列名，
                    而不是 &quot;extracted_data&quot; 或 &quot;results&quot;。
                  </p>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
        {isExpanded && <SchemaForm schema={schema} onUpdate={onUpdate} />}
        {isEmpty && (
          <div className="text-red-500 text-sm mt-1">
            至少需要一个输出字段
          </div>
        )}
        {hasEmptyKeys && !isEmpty && (
          <div className="text-red-500 text-sm mt-1">
            所有字段必须填写键名
          </div>
        )}
      </div>
    );
  }
);

OutputSchema.displayName = "OutputSchema";

OutputSchema.propTypes = {
  schema: PropTypes.array.isRequired,
  onUpdate: PropTypes.func.isRequired,
  isExpanded: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
};

export interface GleaningConfigProps {
  gleaning: { num_rounds: number; validation_prompt: string } | null;
  onUpdate: (
    newGleaning: {
      num_rounds: number;
      validation_prompt: string;
    } | null
  ) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

export const GleaningConfig: React.FC<GleaningConfigProps> = React.memo(
  ({ gleaning, onUpdate, isExpanded, onToggle }) => {
    return (
      <div className="border-t border-primary">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="w-full text-primary hover:bg-primary/10 flex justify-between items-center"
        >
          <div className="flex items-center gap-2">
            <span>
              复核 {gleaning?.num_rounds ? "（已启用）" : "（未启用）"}
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info size={16} className="text-primary" />
                </TooltipTrigger>
                <TooltipContent className="max-w-md whitespace-normal break-words text-left">
                  <p>复核允许通过多轮校验与改进迭代优化输出。</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <ChevronDown
            size={16}
            className={`transition-transform duration-200 ${
              isExpanded ? "transform rotate-180" : ""
            }`}
          />
        </Button>

        {isExpanded && (
          <div className="p-2">
            <div className="grid grid-cols-8 gap-4">
              <div className="col-span-1 space-y-2">
                <Label htmlFor="num_rounds">轮次</Label>
                <Input
                  id="num_rounds"
                  type="number"
                  min="0"
                  max="5"
                  value={gleaning?.num_rounds || 0}
                  onChange={(e) =>
                    onUpdate({
                      ...gleaning,
                      num_rounds: parseInt(e.target.value) || 0,
                    })
                  }
                  className={gleaning?.num_rounds === 0 ? "border-red-500" : ""}
                />
              </div>

              <div className="col-span-7 space-y-2">
                <Label htmlFor="validation_prompt">校验提示词</Label>
                <Textarea
                  id="validation_prompt"
                  value={gleaning?.validation_prompt || ""}
                  onChange={(e) =>
                    onUpdate({
                      ...gleaning,
                      validation_prompt: e.target.value,
                    })
                  }
                  className={
                    !gleaning?.validation_prompt ? "border-red-500" : ""
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

GleaningConfig.displayName = "GleaningConfig";

GleaningConfig.propTypes = {
  // @ts-expect-error - PropTypes null type doesn't match TypeScript optional type
  gleaning: PropTypes.shape({
    num_rounds: PropTypes.number,
    validation_prompt: PropTypes.string,
  }),
  onUpdate: PropTypes.func.isRequired,
  isExpanded: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
};

interface GuardrailsProps {
  guardrails: string[];
  onUpdate: (newGuardrails: string[]) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

export const Guardrails: React.FC<GuardrailsProps> = React.memo(
  ({ guardrails, onUpdate, isExpanded, onToggle }) => {
    const handleGuardrailChange = (index: number, value: string) => {
      const newGuardrails = [...guardrails];
      newGuardrails[index] = value;
      onUpdate(newGuardrails);
    };

    const addGuardrail = () => {
      onUpdate([...guardrails, ""]);
    };

    const removeGuardrail = (index: number) => {
      const newGuardrails = guardrails.filter((_, i) => i !== index);
      onUpdate(newGuardrails);
    };

    return (
      <div className="border-t border-orange-500">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="w-full text-orange-500 hover:bg-orange-50 flex justify-between items-center"
        >
          <div className="flex items-center">
            <span>代码约束（{guardrails.length}）</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info size={16} className="ml-2 text-orange-500" />
                </TooltipTrigger>
                <TooltipContent className="max-w-md whitespace-normal break-words text-left">
                  <p>
                    约束规则是用于校验输出的 Python 语句。例如：
                    &quot;len(output[&quot;summary&quot;]) &gt; 100&quot;
                    可确保摘要至少 100 个字符。
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <ChevronDown
            size={16}
            className={`transition-transform duration-200 ${
              isExpanded ? "transform rotate-180" : ""
            }`}
          />
        </Button>
        {isExpanded && (
          <div className="bg-orange-50">
            {guardrails.map((guardrail, index) => (
              <div key={index} className="flex items-center mb-2">
                <Input
                  value={guardrail}
                  onChange={(e) => handleGuardrailChange(index, e.target.value)}
                  placeholder="输入约束条件"
                  className="flex-grow text-sm text-orange-700 font-mono"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeGuardrail(index)}
                  className="ml-2 p-1 h-7 w-7 hover:bg-orange-100"
                >
                  <Trash2 size={15} className="text-orange-500" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={addGuardrail}
              className="mb-1 text-orange-500 border-orange-500 hover:bg-orange-100"
            >
              <Plus size={16} className="mr-2" /> 添加约束
            </Button>
          </div>
        )}
      </div>
    );
  }
);

Guardrails.displayName = "Guardrails";

Guardrails.propTypes = {
  guardrails: PropTypes.arrayOf(PropTypes.string).isRequired,
  onUpdate: PropTypes.func.isRequired,
  isExpanded: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
};

interface CodeInputProps {
  code: string;
  operationType: "code_map" | "code_reduce" | "code_filter";
  onChange: (value: string) => void;
}

export const CodeInput: React.FC<CodeInputProps> = React.memo(
  ({ code, operationType, onChange }) => {
    const [isExpanded, setIsExpanded] = React.useState(false);

    const getPlaceholder = () => {
      switch (operationType) {
        case "code_map":
          return `def transform(doc: dict) -> dict:
    # Transform a single document
    # Return a dictionary with new key-value pairs
    return {
        'new_key': process(doc['existing_key'])
    }`;
        case "code_filter":
          return `def transform(doc: dict) -> bool:
    # Return True to keep the document, False to filter it out
    return doc['score'] >= 0.5`;
        case "code_reduce":
          return `def transform(items: list) -> dict:
    # Aggregate multiple items into a single result
    # Return a dictionary with aggregated values
    return {
        'total': sum(item['value'] for item in items),
        'count': len(items)
    }`;
      }
    };

    const validatePythonCode = (value: string) => {
      return value.includes("def transform") && value.includes("return");
    };

    const editorValue = code || getPlaceholder();

    const getTooltipContent = () => {
      switch (operationType) {
        case "code_map":
          return "使用 Python 代码独立处理每个文档。transform 函数接收单个文档并返回包含新键值对的字典。";
        case "code_filter":
          return "使用 Python 代码过滤文档。transform 函数接收单个文档并返回 True 保留或 False 过滤。";
        case "code_reduce":
          return "使用 Python 代码聚合多个文档。transform 函数接收文档列表并返回单个聚合结果。";
      }
    };

    return (
      <div className="space-y-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Label>Python 代码</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-gray-500" />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  <p className="text-sm">{getTooltipContent()}</p>
                  <p className="text-sm mt-2">
                    代码操作可用于：
                    <ul className="list-disc ml-4 mt-1">
                      <li>确定性处理</li>
                      <li>复杂计算</li>
                      <li>与 Python 库集成</li>
                      <li>结构化数据转换</li>
                    </ul>
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            onClick={() => setIsExpanded(true)}
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            放大编辑
          </Button>
        </div>
        <div
          className="group relative overflow-hidden rounded-md border border-slate-200 bg-white focus-within:border-blue-300 focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.12)]"
          onDoubleClick={() => setIsExpanded(true)}
          title="双击可放大编辑"
          style={{
            resize: "vertical",
            overflow: "auto",
            minHeight: "200px",
            height: "220px",
          }}
        >
          <Editor
            height="100%"
            defaultLanguage="python"
            value={editorValue}
            onChange={(value) => onChange(value || "")}
            options={{
              minimap: { enabled: false },
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              wordWrap: "on",
              wrappingIndent: "indent",
              automaticLayout: true,
              tabSize: 4,
              fontSize: 14,
              fontFamily: "monospace",
              suggest: {
                showKeywords: true,
                showSnippets: true,
              },
            }}
          />
        </div>
        {!validatePythonCode(code) && (
          <div className="text-red-500 text-sm">
            代码必须定义包含 return 的 transform 函数
          </div>
        )}

        <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
          <DialogContent className="h-[86vh] w-[min(92vw,1080px)] max-w-[1080px] overflow-hidden border border-slate-200 bg-white p-0 text-slate-900">
            <DialogHeader className="border-b border-slate-100 px-5 py-4">
              <DialogTitle className="flex items-center justify-between text-sm font-semibold">
                <span>Python 代码（放大编辑）</span>
              </DialogTitle>
            </DialogHeader>
            <div className="h-[calc(86vh-68px)] p-4">
              <div className="h-full overflow-hidden rounded-md border border-slate-200 bg-white">
                <Editor
                  height="100%"
                  defaultLanguage="python"
                  value={editorValue}
                  onChange={(value) => onChange(value || "")}
                  options={{
                    minimap: { enabled: false },
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    wrappingIndent: "indent",
                    automaticLayout: true,
                    tabSize: 4,
                    fontSize: 15,
                    fontFamily: "monospace",
                    suggest: {
                      showKeywords: true,
                      showSnippets: true,
                    },
                  }}
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

CodeInput.displayName = "CodeInput";

CodeInput.propTypes = {
  code: PropTypes.string.isRequired,
  // @ts-expect-error - PropTypes string union doesn't match TypeScript type exactly
  operationType: PropTypes.oneOf(["code_map", "code_reduce", "code_filter"])
    .isRequired,
  onChange: PropTypes.func.isRequired,
};
