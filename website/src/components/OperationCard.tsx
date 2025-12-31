import React, {
  useReducer,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import {
  Trash2,
  Zap,
  Settings,
  ListCollapse,
  Wand2,
  ChevronDown,
  Eye,
  EyeOff,
  Menu,
  Shield,
  Pencil,
  MoveUp,
  MoveDown,
} from "lucide-react";
import { Operation, SchemaItem } from "@/app/types";
import { usePipelineContext } from "@/contexts/PipelineContext";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { debounce } from "lodash";
import { Guardrails, GleaningConfig } from "./operations/args";
import { backendFetch } from "@/lib/backendFetch";
import createOperationComponent from "./operations/components";
import { useWebSocket } from "@/contexts/WebSocketContext";
import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { canBeOptimized } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { PromptImprovementDialog } from "@/components/PromptImprovementDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OperationHelpButton } from "./OperationHelpButton";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { usePipelineStore } from "@/contexts/PipelineStoreContext";

// Separate components
interface OperationHeaderProps {
  name: string;
  type: Operation["type"];
  llmType: string;
  disabled: boolean;
  currOp: boolean;
  expanded: boolean;
  visibility: boolean;
  optimizeResult?: string;
  isGuardrailsExpanded: boolean;
  isGleaningsExpanded: boolean;
  onEdit: (name: string) => void;
  onDelete: () => void;
  onToggleSettings: () => void;
  onShowOutput: () => void;
  onOptimize: () => void;
  onToggleExpand: () => void;
  onToggleVisibility: () => void;
  onImprovePrompt: () => void;
  onToggleGuardrails: () => void;
  onToggleGleanings: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  model?: string;
  onModelChange?: (newModel: string) => void;
  variant?: "default" | "execute";
}

const executeBadgeStyles: Partial<Record<Operation["type"], string>> = {
  map: "bg-emerald-50 text-emerald-700 border-emerald-200",
  filter: "bg-amber-50 text-amber-700 border-amber-200",
  reduce: "bg-orange-50 text-orange-700 border-orange-200",
  split: "bg-purple-50 text-purple-700 border-purple-200",
  gather: "bg-sky-50 text-sky-700 border-sky-200",
  sample: "bg-indigo-50 text-indigo-700 border-indigo-200",
  resolve: "bg-pink-50 text-pink-700 border-pink-200",
  unnest: "bg-slate-50 text-slate-700 border-slate-200",
  extract: "bg-teal-50 text-teal-700 border-teal-200",
  parallel_map: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rank: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  code_map: "bg-blue-50 text-blue-700 border-blue-200",
  code_reduce: "bg-orange-50 text-orange-700 border-orange-200",
  code_filter: "bg-amber-50 text-amber-700 border-amber-200",
};

const OPERATION_TYPE_LABELS: Record<Operation["type"], string> = {
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

const getExecuteBadgeStyle = (type: Operation["type"]) =>
  executeBadgeStyles[type] ??
  "bg-slate-50 text-slate-600 border-slate-200";

const getOperationTypeLabel = (type: Operation["type"]) =>
  OPERATION_TYPE_LABELS[type] ?? type;

const OperationHeader: React.FC<OperationHeaderProps> = React.memo(
  ({
    name,
    type,
    llmType,
    disabled,
    currOp,
    expanded,
    visibility,
    optimizeResult,
    isGuardrailsExpanded,
    isGleaningsExpanded,
    onEdit,
    onDelete,
    onToggleSettings,
    onShowOutput,
    onOptimize,
    onToggleExpand,
    onToggleVisibility,
    onImprovePrompt,
    onToggleGuardrails,
    onToggleGleanings,
    onMoveUp,
    onMoveDown,
    isFirst,
    isLast,
    model,
    onModelChange,
    variant = "default",
  }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(name);
    const [isEditingModel, setIsEditingModel] = useState(false);
    const [editedModel, setEditedModel] = useState(model);
    const isExecute = variant === "execute";
    const badgeVariant = isExecute
      ? "outline"
      : currOp
      ? "default"
      : "secondary";
    const badgeClassName = isExecute
      ? cn(
          "uppercase text-[10px] font-mono font-bold tracking-wider border",
          getExecuteBadgeStyle(type)
        )
      : undefined;
    const typeLabel = getOperationTypeLabel(type);

    return (
      <div
        className={cn(
          "relative flex items-center",
          isExecute
            ? "px-4 pt-4 pb-3"
            : "py-3 px-4 border-b border-border/30 bg-muted/5"
        )}
      >
        {/* Left side - Operation info */}
        <div className="flex-1 flex items-center gap-2">
          <div className="flex items-center gap-2">
            <Badge
              variant={badgeVariant}
              className={badgeClassName}
            >
              {typeLabel}
            </Badge>

            {/* Add help button for LLM operations */}
            {llmType === "LLM" &&
              (type === "map" || type === "reduce" || type === "filter") && (
                <OperationHelpButton type={type} />
              )}

            {canBeOptimized(type) && optimizeResult !== undefined && (
              <HoverCard openDelay={200}>
                <HoverCardTrigger asChild>
                  <div
                    className={`w-2 h-2 rounded-full cursor-help transition-colors
                      ${
                        optimizeResult === null || optimizeResult === ""
                          ? "bg-gray-300"
                          : "bg-amber-500 animate-pulse"
                      }`}
                  />
                </HoverCardTrigger>
                <HoverCardContent className="w-72" side="bottom" align="start">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">
                      {optimizeResult === undefined || optimizeResult === null
                        ? "正在分析"
                        : optimizeResult === ""
                        ? "拆分状态"
                        : "建议拆分"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {optimizeResult === undefined || optimizeResult === null
                        ? "正在分析操作复杂度..."
                        : optimizeResult === ""
                        ? "该操作无需拆分"
                        : "建议拆分：" + optimizeResult}
                    </p>
                  </div>
                </HoverCardContent>
              </HoverCard>
            )}

            {llmType === "LLM" && (
              <div className="flex items-center">
                {isEditingModel ? (
                  <Input
                    value={editedModel}
                    onChange={(e) => setEditedModel(e.target.value)}
                    onBlur={() => {
                      setIsEditingModel(false);
                      onModelChange?.(editedModel || "");
                    }}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        setIsEditingModel(false);
                        onModelChange?.(editedModel || "");
                      }
                    }}
                    className="max-w-[150px] h-6 text-xs font-mono"
                    autoFocus
                  />
                ) : (
                  <div
                    className="flex items-center gap-1 group cursor-pointer"
                    onClick={() => setIsEditingModel(true)}
                  >
                    <span
                      className={cn(
                        "text-xs font-mono text-muted-foreground",
                        isExecute && "text-slate-400"
                      )}
                    >
                      {model}
                    </span>
                    <Pencil
                      size={11}
                      className={cn(
                        "opacity-0 group-hover:opacity-70 transition-opacity text-muted-foreground",
                        isExecute && "text-slate-500"
                      )}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center">
            {isEditing ? (
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={() => {
                  setIsEditing(false);
                  onEdit(editedName);
                }}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    setIsEditing(false);
                    onEdit(editedName);
                  }
                }}
                className="max-w-[200px] h-6 text-sm font-medium"
                autoFocus
              />
            ) : (
              <div
                className="flex items-center gap-1 group cursor-pointer"
                onClick={() => setIsEditing(true)}
              >
                <span
                  className={cn(
                    "text-sm font-medium select-none",
                    llmType === "LLM" &&
                      !isExecute &&
                      "bg-gradient-to-r from-blue-600 to-purple-600 text-transparent bg-clip-text font-semibold",
                    isExecute && "text-slate-900"
                  )}
                >
                  {name}
                </span>
                <Pencil
                  size={13}
                  className={cn(
                    "opacity-0 group-hover:opacity-70 transition-opacity text-muted-foreground",
                    isExecute && "text-slate-500"
                  )}
                />
              </div>
            )}
          </div>
        </div>

        {/* Action Bar - Keep only the most essential actions */}
        <div className="flex items-center gap-2 mr-2">
          {/* Show Outputs Button */}
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "flex items-center gap-1",
              isExecute &&
                "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            )}
            onClick={onShowOutput}
            disabled={disabled}
          >
            <ListCollapse className="h-4 w-4" />
            <span className="hidden sm:inline">
              显示输出
            </span>
          </Button>

          {/* LLM-specific Actions */}
          {llmType === "LLM" && (
            !isExecute && (
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "flex items-center gap-1",
                isExecute &&
                  "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              )}
              onClick={onImprovePrompt}
            >
              <Wand2 className="h-4 w-4" />
              <span className="hidden sm:inline">改进提示词</span>
            </Button>
            )
          )}

          {/* More Options Menu */}
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "h-8 w-8 p-0",
                  isExecute &&
                    "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                <Menu className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className={cn(
                "w-56 p-1",
                isExecute && "bg-white border-slate-200 text-slate-700"
              )}
              align="end"
            >
              <div className="space-y-0.5">
                {/* Move operation actions */}
                {!isFirst && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={onMoveUp}
                  >
                    <MoveUp className="mr-2 h-4 w-4" />
                    上移
                  </Button>
                )}
                {!isLast && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={onMoveDown}
                  >
                    <MoveDown className="mr-2 h-4 w-4" />
                    下移
                  </Button>
                )}
                {(!isFirst || !isLast) && (
                  <div
                    className={cn(
                      "h-px my-1",
                      isExecute ? "bg-slate-200" : "bg-gray-100"
                    )}
                  />
                )}

                {/* LLM-specific menu items */}
                {llmType === "LLM" && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start"
                      onClick={onToggleGuardrails}
                    >
                      <Shield className="mr-2 h-4 w-4" />
                      {isGuardrailsExpanded
                        ? "隐藏约束"
                        : "显示约束"}
                    </Button>

                    {(type === "map" ||
                      type === "reduce" ||
                      type === "filter") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={onToggleGleanings}
                      >
                        <Shield className="mr-2 h-4 w-4" />
                        {isGleaningsExpanded
                          ? "隐藏复核"
                          : "显示复核"}
                      </Button>
                    )}
                    <div
                      className={cn(
                        "h-px my-1",
                        isExecute ? "bg-slate-200" : "bg-gray-100"
                      )}
                    />
                  </>
                )}

                {/* Optimization in menu for supported types */}
                {canBeOptimized(type) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={onOptimize}
                    disabled={disabled}
                  >
                    <Zap className="mr-2 h-4 w-4" />
                    优化操作
                  </Button>
                )}

                {/* Settings */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={onToggleSettings}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  其他参数
                </Button>

                {/* Visibility Toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={onToggleVisibility}
                >
                  {visibility ? (
                    <>
                      <EyeOff className="mr-2 h-4 w-4" />
                      跳过操作
                    </>
                  ) : (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      纳入操作
                    </>
                  )}
                </Button>

                <div
                  className={cn(
                    "h-px my-1",
                    isExecute ? "bg-slate-200" : "bg-gray-100"
                  )}
                />

                {/* Delete Operation */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  onClick={onDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  删除
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Expand/Collapse Button */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 w-8 p-0 rounded-full",
              isExecute ? "hover:bg-slate-100" : "hover:bg-gray-100"
            )}
            onClick={onToggleExpand}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transform transition-transform",
                expanded ? "rotate-180" : "",
                isExecute ? "text-slate-500" : "text-gray-600"
              )}
            />
          </Button>
        </div>
      </div>
    );
  }
);
OperationHeader.displayName = "OperationHeader";

interface SettingsModalProps {
  opName: string;
  opType: string;
  isOpen: boolean;
  onClose: () => void;
  otherKwargs: Record<string, string>;
  onSettingsSave: (newSettings: Record<string, string>) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = React.memo(
  ({ opName, opType, isOpen, onClose, otherKwargs, onSettingsSave }) => {
    const opTypeLabel = getOperationTypeLabel(opType as Operation["type"]);
    const [localSettings, setLocalSettings] = React.useState<
      Array<{ id: number; key: string; value: string }>
    >(
      Object.entries(otherKwargs).map(([key, value], index) => ({
        id: index,
        key,
        value,
      }))
    );

    useEffect(() => {
      setLocalSettings(
        Object.entries(otherKwargs).map(([key, value], index) => ({
          id: index,
          key,
          value,
        }))
      );
    }, [otherKwargs]);

    const handleSettingsChange = (
      id: number,
      newKey: string,
      newValue: string
    ) => {
      setLocalSettings((prev) =>
        prev.map((setting) =>
          setting.id === id
            ? { ...setting, key: newKey, value: newValue }
            : setting
        )
      );
    };

    const addSetting = () => {
      setLocalSettings((prev) => [
        ...prev,
        { id: prev.length, key: "", value: "" },
      ]);
    };

    const removeSetting = (id: number) => {
      setLocalSettings((prev) => prev.filter((setting) => setting.id !== id));
    };

    const handleSave = () => {
      const newSettings = localSettings.reduce((acc, { key, value }) => {
        if (key !== "" && value !== "") {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>);
      onSettingsSave(newSettings);
      onClose();
    };

    const isValidSettings = () => {
      const keys = localSettings.map(({ key }) => key);
      return (
        localSettings.every(({ key, value }) => key !== "" && value !== "") &&
        new Set(keys).size === keys.length
      );
    };

    if (!isOpen) return null;

    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{opName}</DialogTitle>
            <DialogDescription>
              为此 {opTypeLabel} 操作添加或修改额外参数。例如，设置 LiteLLM
              completion 参数时，可使用 litellm_completion_kwargs 作为键，
              {`{"temperature": 0}`} 作为值。参见{" "}
              <a
                href="https://docs.litellm.ai/docs/completion/input"
                target="_blank"
                className="underline text-blue-500"
              >
                LiteLLM completion 参数
              </a>{" "}
              了解全部可用选项。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {localSettings.map(({ id, key, value }) => (
              <div key={id} className="flex items-center gap-4">
                <Input
                  className="flex-grow font-mono"
                  value={key}
                  onChange={(e) =>
                    handleSettingsChange(id, e.target.value, value)
                  }
                  placeholder="键"
                />
                <Input
                  className="flex-grow font-mono"
                  value={value}
                  onChange={(e) =>
                    handleSettingsChange(id, key, e.target.value)
                  }
                  placeholder="值"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSetting(id)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
            <Button onClick={addSetting}>新增参数</Button>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={!isValidSettings()}>
              保存
            </Button>
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);
SettingsModal.displayName = "SettingsModal";

// Action types
type Action =
  | { type: "SET_OPERATION"; payload: Operation }
  | { type: "UPDATE_NAME"; payload: string }
  | { type: "UPDATE_PROMPT"; payload: string }
  | { type: "UPDATE_SCHEMA"; payload: SchemaItem[] }
  | { type: "UPDATE_GUARDRAILS"; payload: string[] }
  | { type: "TOGGLE_EDITING" }
  | { type: "TOGGLE_SCHEMA" }
  | { type: "TOGGLE_GUARDRAILS" }
  | { type: "TOGGLE_SETTINGS" }
  | { type: "SET_RUN_INDEX"; payload: number }
  | { type: "UPDATE_SETTINGS"; payload: Record<string, string> }
  | { type: "TOGGLE_EXPAND" }
  | {
      type: "UPDATE_GLEANINGS";
      payload: { num_rounds: number; validation_prompt: string };
    }
  | { type: "TOGGLE_GLEANINGS" };

// State type
type State = {
  operation: Operation | undefined;
  isEditing: boolean;
  isSchemaExpanded: boolean;
  isGuardrailsExpanded: boolean;
  isSettingsOpen: boolean;
  isExpanded: boolean;
  isGleaningsExpanded: boolean;
};

// Reducer function
function operationReducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_OPERATION":
      return { ...state, operation: action.payload };
    case "UPDATE_NAME":
      return state.operation
        ? { ...state, operation: { ...state.operation, name: action.payload } }
        : state;
    case "UPDATE_PROMPT":
      return state.operation
        ? {
            ...state,
            operation: { ...state.operation, prompt: action.payload },
          }
        : state;
    case "UPDATE_SCHEMA":
      return state.operation
        ? {
            ...state,
            operation: {
              ...state.operation,
              output: {
                ...state.operation.output,
                schema: action.payload,
              },
            },
          }
        : state;

    case "UPDATE_GUARDRAILS":
      return state.operation
        ? {
            ...state,
            operation: { ...state.operation, validate: action.payload },
          }
        : state;
    case "TOGGLE_EDITING":
      return { ...state, isEditing: !state.isEditing };
    case "TOGGLE_SCHEMA":
      return { ...state, isSchemaExpanded: !state.isSchemaExpanded };
    case "TOGGLE_GUARDRAILS":
      return { ...state, isGuardrailsExpanded: !state.isGuardrailsExpanded };
    case "TOGGLE_SETTINGS":
      return { ...state, isSettingsOpen: !state.isSettingsOpen };
    case "UPDATE_SETTINGS":
      return state.operation
        ? {
            ...state,
            operation: { ...state.operation, otherKwargs: action.payload },
          }
        : state;
    case "SET_RUN_INDEX":
      return state.operation
        ? {
            ...state,
            operation: { ...state.operation, runIndex: action.payload },
          }
        : state;
    case "TOGGLE_EXPAND":
      return { ...state, isExpanded: !state.isExpanded };
    case "UPDATE_GLEANINGS":
      return state.operation
        ? {
            ...state,
            operation: { ...state.operation, gleaning: action.payload },
          }
        : state;
    case "TOGGLE_GLEANINGS":
      return { ...state, isGleaningsExpanded: !state.isGleaningsExpanded };
    default:
      return state;
  }
}

// Initial state
const initialState: State = {
  operation: undefined,
  isEditing: false,
  isSchemaExpanded: true,
  isGuardrailsExpanded: false,
  isSettingsOpen: false,
  isExpanded: true,
  isGleaningsExpanded: false,
};

// Add id to the props interface
interface Props {
  index: number;
  id?: string;
  variant?: "default" | "execute";
}

// Main component
export const OperationCard: React.FC<Props> = ({ index, id, variant }) => {
  const [state, dispatch] = useReducer(
    operationReducer,
    initialState,
    (base) => ({
      ...base,
      isExpanded: variant === "execute" ? false : base.isExpanded,
    })
  );
  const {
    operation,
    isEditing,
    isSchemaExpanded,
    isGuardrailsExpanded,
    isSettingsOpen,
    isExpanded,
    isGleaningsExpanded,
  } = state;

  const {
    output: pipelineOutput,
    setOutput,
    isLoadingOutputs,
    setIsLoadingOutputs,
    numOpRun,
    setNumOpRun,
    currentFile,
    operations,
    setOperations,
    pipelineName,
    sampleSize,
    setCost,
    defaultModel,
    optimizerModel,
    setTerminalOutput,
    namespace,
    apiKeys,
    systemPrompt,
    extraPipelineSettings,
  } = usePipelineContext();
  const { activePipelineId } = usePipelineStore();
  const { toast } = useToast();
  const isExecute = variant === "execute";

  const operationRef = useRef(operation);
  const { connect, sendMessage, lastMessage, readyState, disconnect } =
    useWebSocket();

  useEffect(() => {
    operationRef.current = operation;
  }, [operation]);

  useEffect(() => {
    dispatch({ type: "SET_OPERATION", payload: operations[index] });

    // Also dispatch the runIndex update
    if (operations[index].runIndex !== undefined) {
      dispatch({ type: "SET_RUN_INDEX", payload: operations[index].runIndex });
    }
  }, [operations, index]);

  const debouncedUpdate = useCallback(
    debounce(() => {
      if (operationRef.current) {
        const updatedOperation = { ...operationRef.current };
        setOperations((prev) =>
          prev.map((op) =>
            op.id === updatedOperation.id ? updatedOperation : op
          )
        );
      }
    }, 500),
    [setOperations]
  );

  const handleOperationUpdate = useCallback(
    (updatedOperation: Operation) => {
      dispatch({ type: "SET_OPERATION", payload: updatedOperation });
      debouncedUpdate();
    },
    [debouncedUpdate]
  );

  const handleSettingsSave = useCallback(
    (newSettings: Record<string, string>) => {
      dispatch({ type: "UPDATE_SETTINGS", payload: newSettings });
      if (operation) {
        const updatedOperation = { ...operation, otherKwargs: newSettings };
        setOperations((prev) =>
          prev.map((op) =>
            op.id === updatedOperation.id ? updatedOperation : op
          )
        );
      }
    },
    [operation, setOperations]
  );

  const hasOpenAIKey = useMemo(() => {
    return apiKeys.some((key) => key.name === "OPENAI_API_KEY");
  }, [apiKeys]);

  const [showOptimizeDialog, setShowOptimizeDialog] = useState(false);
  const [isLocalMode, setIsLocalMode] = useState(false);

  const onOptimize = useCallback(async () => {
    if (!operation) return;
    setShowOptimizeDialog(true);
  }, [operation]);

  const handleOptimizeConfirm = useCallback(async () => {
    if (!operation) return;

    try {
      // Clear the output
      setTerminalOutput("");
      setIsLoadingOutputs(true);

      // Write pipeline config
      const response = await backendFetch("/api/writePipelineConfig", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          default_model: defaultModel,
          data: { path: currentFile?.path || "" },
          operations,
          operation_id: operation.id,
          name: pipelineName,
          sample_size: sampleSize,
          optimize: true,
          clear_intermediate: false,
          system_prompt: systemPrompt,
          namespace: namespace,
          apiKeys: apiKeys,
          optimizerModel: optimizerModel,
          extraPipelineSettings: extraPipelineSettings,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const { filePath } = await response.json();

      // Ensure WebSocket is connected
      await connect();

      // Send message to run the pipeline
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
      // Close the WebSocket connection
      disconnect();
    } finally {
      setShowOptimizeDialog(false);
    }
  }, [
    operation,
    defaultModel,
    currentFile,
    operations,
    pipelineName,
    sampleSize,
    optimizerModel,
    connect,
    sendMessage,
    systemPrompt,
    namespace,
    apiKeys,
    extraPipelineSettings,
    activePipelineId,
  ]);

  const onShowOutput = useCallback(async () => {
    if (!operation) return;

    try {
      const response = await backendFetch("/api/getInputOutput", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          default_model: defaultModel,
          data: { path: currentFile?.path || "" },
          operations,
          operation_id: operation.id,
          name: pipelineName,
          sample_size: sampleSize,
          namespace,
          extraPipelineSettings,
        }),
      });

      if (!response.ok) {
        throw new Error("获取输入/输出路径失败");
      }

      const { inputPath, outputPath } = await response.json();

      setOutput({
        operationId: operation.id,
        path: outputPath,
        inputPath: inputPath,
      });
    } catch (error) {
      console.error("Error fetching input and output paths:", error);
      toast({
        title: "错误",
        description: "获取输入/输出路径失败",
        variant: "destructive",
      });
    }
  }, [
    operation,
    defaultModel,
    currentFile,
    operations,
    pipelineName,
    sampleSize,
    setOutput,
    toast,
  ]);

  const handleAIEdit = useCallback(
    async (instruction: string) => {
      if (!operation) return;

      try {
        const response = await backendFetch("/api/edit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operation,
            instruction,
          }),
        });

        if (!response.ok) {
          throw new Error("应用 AI 编辑失败");
        }

        const updatedOperation = await response.json();
        handleOperationUpdate(updatedOperation);

        toast({
          title: "成功",
          description: "操作已更新",
        });
      } catch (error) {
        console.error("Error applying AI edit:", error);
        toast({
          title: "错误",
          description: "应用 AI 编辑失败",
          variant: "destructive",
        });
      }
    },
    [operation, handleOperationUpdate, toast]
  );

  const handleGuardrailsUpdate = useCallback(
    (newGuardrails: string[]) => {
      dispatch({ type: "UPDATE_GUARDRAILS", payload: newGuardrails });
      debouncedUpdate();
    },
    [debouncedUpdate]
  );

  const handleGleaningsUpdate = useCallback(
    (newGleanings: { num_rounds: number; validation_prompt: string }) => {
      dispatch({ type: "UPDATE_GLEANINGS", payload: newGleanings });
      debouncedUpdate();
    },
    [debouncedUpdate]
  );

  const handleVisibilityToggle = useCallback(() => {
    if (!operation) return;

    const updatedOperation = {
      ...operation,
      visibility:
        operation.visibility === undefined ? false : !operation.visibility,
    };

    handleOperationUpdate(updatedOperation);
  }, [operation, handleOperationUpdate]);

  const [showPromptImprovement, setShowPromptImprovement] = useState(false);

  const handlePromptSave = (
    newPrompt:
      | string
      | { comparison_prompt: string; resolution_prompt: string },
    schemaChanges?: Array<[string, string]>
  ) => {
    if (!operation) return;

    let updatedOperation = { ...operation };

    if (operation.type === "resolve") {
      if (typeof newPrompt === "object") {
        updatedOperation = {
          ...updatedOperation,
          otherKwargs: {
            ...operation.otherKwargs,
            comparison_prompt: newPrompt.comparison_prompt,
            resolution_prompt: newPrompt.resolution_prompt,
          },
        };
      }
    } else {
      if (typeof newPrompt === "string") {
        updatedOperation.prompt = newPrompt;
      }
    }

    // Handle schema changes
    if (schemaChanges?.length && operation.output?.schema) {
      const updatedSchema = operation.output.schema.map((item) => {
        const change = schemaChanges.find(([oldKey]) => oldKey === item.key);
        if (change) {
          return { ...item, key: change[1] };
        }
        return item;
      });

      updatedOperation.output = {
        ...operation.output,
        schema: updatedSchema,
      };
    }

    handleOperationUpdate(updatedOperation);
    toast({
      title: "成功",
      description: `提示词${
        operation.type === "resolve" ? "（多条）" : ""
      }与 schema 已更新`,
    });
  };

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleMoveUp = useCallback(() => {
    if (index > 0) {
      setOperations((prevOperations) => {
        const newOperations = [...prevOperations];
        [newOperations[index - 1], newOperations[index]] = [
          newOperations[index],
          newOperations[index - 1],
        ];
        return newOperations;
      });
    }
  }, [index, setOperations]);

  const handleMoveDown = useCallback(() => {
    if (index < operations.length - 1) {
      setOperations((prevOperations) => {
        const newOperations = [...prevOperations];
        [newOperations[index], newOperations[index + 1]] = [
          newOperations[index + 1],
          newOperations[index],
        ];
        return newOperations;
      });
    }
  }, [index, operations.length, setOperations]);

  const handleModelChange = useCallback(
    (newModel: string) => {
      if (!operation) return;
      const updatedOperation = {
        ...operation,
        otherKwargs: {
          ...operation.otherKwargs,
          model: newModel,
        },
      };
      handleOperationUpdate(updatedOperation);
    },
    [operation, handleOperationUpdate]
  );

  const operationId = operation?.id ?? null;
  const operationKwargs = operation?.otherKwargs;

  const progressMeta = useMemo(() => {
    if (!isExecute || !operationId) {
      return null;
    }

    if (!pipelineOutput) {
      return {
        label: "等待中",
        value: 0,
        color: "bg-slate-300",
        tone: "text-slate-500",
      };
    }

    if (isLoadingOutputs) {
      const isActive = operationId === pipelineOutput.operationId;
      return isActive
        ? {
            label: "处理中...",
            value: 45,
            color: "bg-blue-500",
            tone: "text-blue-600",
          }
        : {
            label: "已完成",
            value: 100,
            color: "bg-emerald-500",
            tone: "text-emerald-600",
          };
    }

    return {
      label: "已完成",
      value: 100,
      color: "bg-emerald-500",
      tone: "text-emerald-600",
    };
  }, [isExecute, isLoadingOutputs, operationId, pipelineOutput]);

  const durationText = useMemo(() => {
    if (!isExecute || !operationKwargs) return null;
    const duration =
      operationKwargs?.latency_ms ??
      operationKwargs?.duration_ms ??
      null;
    if (typeof duration === "number" && Number.isFinite(duration)) {
      return `${Math.round(duration)}ms`;
    }
    return "--";
  }, [isExecute, operationKwargs]);

  const isRunning = progressMeta?.label === "处理中...";

  if (!operation) {
    return <SkeletonCard />;
  }

  return (
    <div
      id={id}
      className={cn(
        "mb-2 relative w-full pl-6 rounded-lg border transition-colors",
        isExecute
          ? "bg-white border-slate-200 shadow-sm hover:bg-slate-50"
          : "bg-card border-border/40 shadow-[0_1px_3px_0_rgb(0,0,0,0.05)] hover:shadow-md",
        !isExecute &&
          pipelineOutput?.operationId === operation.id &&
          "border-primary border-2",
        isExecute
          ? "before:absolute before:left-2 before:top-6 before:h-2 before:w-2 before:rounded-full before:bg-slate-300 before:border before:border-slate-200"
          : null,
        isExecute &&
          isExpanded &&
          "border-blue-300 ring-1 ring-blue-200/60 shadow-sm",
        !operation.visibility && "opacity-50"
      )}
    >
      <OperationHeader
        name={operation.name}
        type={operation.type}
        llmType={operation.llmType}
        disabled={isLoadingOutputs || pipelineOutput === undefined}
        currOp={operation.id === pipelineOutput?.operationId}
        expanded={isExpanded}
        visibility={operation.visibility}
        optimizeResult={operation.shouldOptimizeResult}
        isGuardrailsExpanded={isGuardrailsExpanded}
        isGleaningsExpanded={isGleaningsExpanded}
        onEdit={(name) => {
          dispatch({ type: "UPDATE_NAME", payload: name });
          debouncedUpdate();
        }}
        onDelete={() => setShowDeleteDialog(true)}
        onToggleSettings={() => dispatch({ type: "TOGGLE_SETTINGS" })}
        onShowOutput={onShowOutput}
        onOptimize={onOptimize}
        onToggleExpand={() => dispatch({ type: "TOGGLE_EXPAND" })}
        onToggleVisibility={handleVisibilityToggle}
        onImprovePrompt={() => setShowPromptImprovement(true)}
        onToggleGuardrails={() => dispatch({ type: "TOGGLE_GUARDRAILS" })}
        onToggleGleanings={() => dispatch({ type: "TOGGLE_GLEANINGS" })}
        onMoveUp={handleMoveUp}
        onMoveDown={handleMoveDown}
        isFirst={index === 0}
        isLast={index === operations.length - 1}
        model={operation.otherKwargs?.model || defaultModel}
        onModelChange={handleModelChange}
        variant={variant}
      />
      {isExecute && progressMeta ? (
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between text-[10px] font-mono mb-2">
            <span className={cn("font-semibold uppercase", progressMeta.tone)}>
              {progressMeta.label}
            </span>
            <span className="text-slate-500">{durationText}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500 ease-out relative",
                progressMeta.color
              )}
              style={{ width: `${progressMeta.value}%` }}
            >
              {isRunning ? (
                <div className="absolute inset-0 bg-white/50 animate-pulse" />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {isExpanded && operation.visibility !== false && (
        <>
          <CardContent className="p-4">
            {createOperationComponent(
              operation,
              handleOperationUpdate,
              isSchemaExpanded,
              () => dispatch({ type: "TOGGLE_SCHEMA" })
            )}
          </CardContent>

          {operation.llmType === "LLM" && isGuardrailsExpanded && (
            <div className="px-4 pb-4">
              <Guardrails
                guardrails={operation.validate || []}
                onUpdate={handleGuardrailsUpdate}
                isExpanded={true}
                onToggle={() => dispatch({ type: "TOGGLE_GUARDRAILS" })}
              />
            </div>
          )}

          {(operation.type === "map" ||
            operation.type === "reduce" ||
            operation.type === "filter") &&
            isGleaningsExpanded && (
              <div className="px-4 pb-4">
                <GleaningConfig
                  gleaning={operation.gleaning || null}
                  onUpdate={handleGleaningsUpdate}
                  isExpanded={true}
                  onToggle={() => dispatch({ type: "TOGGLE_GLEANINGS" })}
                />
              </div>
            )}
        </>
      )}
      <SettingsModal
        opName={operation.name}
        opType={operation.type}
        isOpen={isSettingsOpen}
        onClose={() => dispatch({ type: "TOGGLE_SETTINGS" })}
        otherKwargs={operation.otherKwargs || {}}
        onSettingsSave={handleSettingsSave}
      />
      {operation.llmType === "LLM" && (
        <PromptImprovementDialog
          open={showPromptImprovement}
          onOpenChange={setShowPromptImprovement}
          currentOperation={operation}
          onSave={handlePromptSave}
        />
      )}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定删除吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销，将永久删除操作“{operation.name}”并从流水线中移除。
              如果只是想在下次运行中隐藏该操作，请在操作菜单中切换可见性。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setOperations((prev) =>
                  prev.filter((op) => op.id !== operation.id)
                );
                setShowDeleteDialog(false);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={showOptimizeDialog}
        onOpenChange={setShowOptimizeDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
          <AlertDialogTitle>优化操作</AlertDialogTitle>
          <AlertDialogDescription>
            {!hasOpenAIKey && !isLocalMode ? (
              <div className="space-y-2">
                <p className="text-destructive font-medium">
                  需要 OpenAI API Key
                </p>
                <p>
                  要使用优化器，请在 编辑 {">"} 编辑 API Key 中添加 OpenAI API Key。
                </p>
                <button
                  className="text-destructive underline hover:opacity-80 font-medium"
                  onClick={() => setIsLocalMode(true)}
                >
                  本地环境变量运行可忽略
                </button>
              </div>
            ) : (
              <p>
                  系统将分析该操作，并在可行时用更高准确度的流水线替换（由
                  LLM-as-a-judge 评估）。是否继续？该过程可能需要 2 到 10
                  分钟，具体取决于数据复杂度。
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleOptimizeConfirm}
            disabled={!hasOpenAIKey && !isLocalMode}
          >
            继续
          </AlertDialogAction>
        </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const SkeletonCard: React.FC = () => (
  <Card className="mb-2 relative rounded-md border border-border/40 shadow-[0_1px_3px_0_rgb(0,0,0,0.05)] w-full hover:shadow-md transition-shadow">
    <CardHeader className="flex justify-between items-center py-2 px-3">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-3 w-1/4" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-16 w-full mb-1" />
      <Skeleton className="h-3 w-2/3" />
    </CardContent>
  </Card>
);
