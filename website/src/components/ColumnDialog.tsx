import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableCell } from "@/components/SearchableCell";
import { PrettyJSON } from "@/components/PrettyJSON";
import { RowNavigator } from "@/components/RowNavigator";
import { ChevronDown, Eye, Search, Trash2 } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { useBookmarkContext } from "@/contexts/BookmarkContext";
import { Textarea } from "@/components/ui/textarea";
import { UserNote } from "@/app/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ColumnStats } from "@/components/ResizableDataTable";
import {
  CategoricalBarChart,
  WordCountHistogram,
} from "@/components/ResizableDataTable";

interface ObservabilityIndicatorProps {
  row: Record<string, unknown>;
  currentOperation: string;
}

const ObservabilityIndicator = React.memo(
  ({ row, currentOperation }: ObservabilityIndicatorProps) => {
    const observabilityEntries = Object.entries(row).filter(
      ([key]) => key === `_observability_${currentOperation}`
    );

    if (observabilityEntries.length === 0) return null;

    return (
      <HoverCard>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            aria-label="查看可观测性详情"
          >
            <Eye className="h-4 w-4" />
          </button>
        </HoverCardTrigger>
        <HoverCardContent
          className="max-h-[600px] w-[760px] overflow-auto"
          side="bottom"
          align="end"
        >
          <div className="space-y-3">
            <h3 className="border-b border-slate-200 pb-2 text-sm font-semibold text-slate-900">
              {currentOperation} 的 LLM 调用
            </h3>
            <div className="space-y-2">
              {observabilityEntries.map(([key, value]) => (
                <pre
                  key={key}
                  className="overflow-auto whitespace-pre-wrap break-words border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700"
                >
                  {typeof value === "object"
                    ? JSON.stringify(value, null, 2)
                    : String(value)}
                </pre>
              ))}
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  }
);
ObservabilityIndicator.displayName = "ObservabilityIndicator";

export interface ColumnDialogColumnOption {
  id: string;
  header: string;
}

export interface ColumnDialogProps<T extends Record<string, unknown>> {
  isOpen: boolean;
  onClose: () => void;
  availableColumns: ColumnDialogColumnOption[];
  selectedColumnId: string;
  onSelectColumn: (columnId: string) => void;
  data: T[];
  currentIndex: number;
  onNavigate: (direction: "prev" | "next") => void;
  onJumpToRow: (index: number) => void;
  currentOperation: string;
  columnStats: ColumnStats | null;
}

function calculatePercentile(value: number, values: number[]): number {
  if (values.length === 0) return 0;
  const sortedValues = [...values].sort((a, b) => a - b);
  const index = sortedValues.findIndex((v) => v >= value);
  if (index === -1) return 100;
  if (index === 0) return 0;
  return Math.max(
    0,
    Math.min(100, Math.round((index / sortedValues.length) * 100))
  );
}

interface ValueStatsProps {
  value: unknown;
  columnStats: ColumnStats | null;
  data: Record<string, unknown>[];
  columnId: string;
}

const ValueStats = React.memo(
  ({ value, columnStats, data, columnId }: ValueStatsProps) => {
    if (!columnStats) return null;

    const typeLabelMap: Record<ColumnStats["type"], string> = {
      number: "数字",
      array: "数组",
      "string-words": "文本（词数）",
      "string-chars": "文本（字符数）",
      boolean: "布尔",
    };

    const typeLabel = typeLabelMap[columnStats.type] ?? columnStats.type;
    const currentValue =
      typeof value === "number"
        ? value
        : typeof value === "string"
        ? columnStats.type === "string-chars"
          ? value.length
          : value.split(/\s+/).length
        : Array.isArray(value)
        ? value.length
        : typeof value === "boolean"
        ? value
          ? 1
          : 0
        : null;

    const allValues = data
      .map((row) => {
        const val = row[columnId];
        if (val == null) return null;
        if (typeof val === "number") return val;
        if (typeof val === "string") {
          return columnStats.type === "string-chars"
            ? val.length
            : val.split(/\s+/).length;
        }
        if (Array.isArray(val)) return val.length;
        if (typeof val === "boolean") return val ? 1 : 0;
        return null;
      })
      .filter((v): v is number => v !== null);

    const percentile =
      currentValue !== null
        ? calculatePercentile(currentValue, allValues)
        : null;

    return (
      <div className="border-b border-slate-200/80 bg-slate-50/70 px-4 py-3">
        <div className="mb-2 flex items-center gap-5">
          {percentile !== null && (
            <div className="flex-none">
              <div className="text-2xl font-bold text-primary">
                {percentile}
                <span className="text-base">%</span>
              </div>
              <div className="text-xs text-muted-foreground">百分位</div>
            </div>
          )}

          <div className="h-[105px] flex-1">
            {columnStats.isLowCardinality ? (
              <CategoricalBarChart
                data={columnStats.sortedValueCounts}
                height={105}
              />
            ) : (
              <WordCountHistogram
                histogramData={columnStats.distribution.map((count, i) => ({
                  range: String(
                    Math.round(columnStats.min + i * columnStats.bucketSize)
                  ),
                  count,
                  fullRange: `${Math.round(
                    columnStats.min + i * columnStats.bucketSize
                  )} - ${Math.round(
                    columnStats.min + (i + 1) * columnStats.bucketSize
                  )}${
                    columnStats.type === "array"
                      ? " 项"
                      : columnStats.type === "string-chars"
                      ? " 字符"
                      : columnStats.type === "string-words"
                      ? " 词"
                      : ""
                  }`,
                }))}
                height={105}
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs leading-5">
          <div className="space-y-0.5">
            <div className="font-medium">类型</div>
            <div className="text-muted-foreground">{typeLabel}</div>
          </div>
          <div className="space-y-0.5">
            <div className="font-medium">不同值</div>
            <div className="text-muted-foreground">
              {columnStats.distinctCount} / {columnStats.totalCount}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="font-medium">当前值</div>
            <div className="text-muted-foreground">
              {currentValue}
              {columnStats.type === "array"
                ? " 项"
                : columnStats.type === "string-chars"
                ? " 字符"
                : columnStats.type === "string-words"
                ? " 词"
                : ""}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="font-medium">范围</div>
            <div className="text-muted-foreground">
              {columnStats.min} - {columnStats.max}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
ValueStats.displayName = "ValueStats";

export function ColumnDialog<T extends Record<string, unknown>>({
  isOpen,
  onClose,
  availableColumns,
  selectedColumnId,
  onSelectColumn,
  data,
  currentIndex,
  onNavigate,
  onJumpToRow,
  currentOperation,
  columnStats,
}: ColumnDialogProps<T>) {
  const [showPreviousNotes, setShowPreviousNotes] = useState(false);
  const [feedbackColor, setFeedbackColor] = useState("#FF0000");
  const [feedbackText, setFeedbackText] = useState("");
  const [columnSearch, setColumnSearch] = useState("");

  const { addBookmark, getNotesForRowAndColumn, removeBookmark } =
    useBookmarkContext();

  const selectedColumn = useMemo(
    () =>
      availableColumns.find((column) => column.id === selectedColumnId) ??
      availableColumns[0] ??
      null,
    [availableColumns, selectedColumnId]
  );

  useEffect(() => {
    if (!selectedColumn) return;
    if (selectedColumn.id === selectedColumnId) return;
    onSelectColumn(selectedColumn.id);
  }, [onSelectColumn, selectedColumn, selectedColumnId]);

  const filteredColumns = useMemo(() => {
    const normalizedKeyword = columnSearch.trim().toLowerCase();
    if (!normalizedKeyword) return availableColumns;
    return availableColumns.filter((column) =>
      `${column.header}${column.id}`.toLowerCase().includes(normalizedKeyword)
    );
  }, [availableColumns, columnSearch]);

  const currentRow = data[currentIndex] ?? null;
  const selectedColumnKey = selectedColumn?.id ?? "";
  const currentValue = currentRow?.[selectedColumnKey];
  const existingNotes =
    selectedColumn && currentRow
      ? getNotesForRowAndColumn(currentIndex, selectedColumn.id)
      : [];

  useEffect(() => {
    setShowPreviousNotes(false);
    setFeedbackText("");
  }, [selectedColumnId, currentIndex]);

  const renderContent = (value: unknown) => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">无值</span>;
    }

    if (typeof value === "object") {
      return (
        <div className="[&_.sticky]:bg-white [&_.sticky]:backdrop-blur-none">
          <SearchableCell
            content={JSON.stringify(value, null, 2)}
            isResizing={false}
          >
            {(searchTerm) => (searchTerm ? null : <PrettyJSON data={value} />)}
          </SearchableCell>
        </div>
      );
    }

    if (typeof value === "string") {
      const isCodeLike = value.includes("\n") || value.length > 200;
      return (
        <div className="[&_.sticky]:bg-white [&_.sticky]:backdrop-blur-none">
          <SearchableCell content={value} isResizing={false}>
            {(searchTerm) =>
              searchTerm ? null : isCodeLike ? (
                <pre className="overflow-auto whitespace-pre-wrap break-words font-mono text-[14px] leading-6 text-slate-900">
                  {value}
                </pre>
              ) : (
                <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-900">
                  {value}
                </div>
              )
            }
          </SearchableCell>
        </div>
      );
    }

    return String(value);
  };

  const handleSubmitFeedback = useCallback(
    (row: T, note: string) => {
      if (!note.trim() || !selectedColumnKey) return;

      const filteredRowContent = Object.fromEntries(
        Object.entries(row).filter(([key]) => !key.startsWith("_observability"))
      );

      const feedback: UserNote[] = [
        {
          id: Date.now().toString(),
          note,
          metadata: {
            columnId: selectedColumnKey,
            rowIndex: currentIndex,
            mainColumnValue: row[selectedColumnKey],
            rowContent: filteredRowContent,
            operationName: currentOperation,
          },
        },
      ];

      addBookmark(feedbackColor, feedback);
      setFeedbackText("");
    },
    [
      addBookmark,
      currentIndex,
      currentOperation,
      feedbackColor,
      selectedColumnKey,
    ]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLInputElement
      ) {
        return;
      }
      if (e.key === "ArrowLeft") onNavigate("prev");
      if (e.key === "ArrowRight") onNavigate("next");
    },
    [onNavigate]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="flex h-[95vh] max-h-[95vh] w-[96vw] max-w-[96vw] overflow-hidden border-slate-200/80 bg-white p-0 sm:rounded-xl">
        <div className="flex h-full w-full min-h-0">
          <section className="flex min-w-0 flex-1 flex-col bg-white">
            <header className="border-b border-slate-200/80 bg-white">
              <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-3 pr-14">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-xl font-semibold text-slate-900">
                    {selectedColumn?.header ?? "未选择字段"}
                  </h2>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>可观测性</span>
                  <ObservabilityIndicator
                    row={currentRow ?? {}}
                    currentOperation={currentOperation}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-200/70 bg-slate-50/70 px-5 py-2">
                <div className="inline-flex items-center gap-3 border border-slate-200 bg-white px-2 py-1">
                  <RowNavigator
                    currentRow={currentIndex}
                    totalRows={data.length}
                    onNavigate={onNavigate}
                    onJumpToRow={onJumpToRow}
                    disabled={!currentRow}
                  />
                </div>
                <span className="text-xs text-slate-500">快捷键：← / →</span>
              </div>
            </header>

            <div className="min-h-0 flex-1 bg-white p-4">
              {!selectedColumn || !currentRow ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  请先选择字段并定位到有效数据行
                </div>
              ) : (
                <div className="flex h-full min-h-0 flex-col overflow-hidden border border-slate-200/80 bg-white">
                  <ValueStats
                    value={currentValue}
                    columnStats={columnStats}
                    data={data}
                    columnId={selectedColumn.id}
                  />
                  <div className="min-h-0 flex-1 px-4 py-3">
                    <div className="h-full min-h-0 overflow-auto px-3 py-2">
                      {renderContent(currentValue)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="flex w-[320px] min-h-0 flex-col border-l border-slate-200/80 bg-white">
            <section className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-slate-200/80 bg-slate-50/70 px-4 py-3">
                <div className="text-sm font-semibold text-slate-800">字段浏览</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  在当前弹窗中自由切换查看字段
                </div>
                <div className="mt-2 flex items-center gap-2 border border-slate-200 bg-white px-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <Input
                    value={columnSearch}
                    onChange={(e) => setColumnSearch(e.target.value)}
                    placeholder="搜索字段..."
                    className="h-8 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
                    aria-label="搜索字段"
                  />
                </div>
              </div>

              <div
                className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
                role="listbox"
                aria-label="字段列表"
              >
                {filteredColumns.map((column) => {
                  const isActive = column.id === selectedColumn?.id;
                  return (
                    <button
                      key={column.id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => onSelectColumn(column.id)}
                      className={`w-full border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                        isActive
                          ? "border-blue-200 bg-blue-50 text-blue-900"
                          : "border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="truncate text-sm font-medium">
                        {column.header}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {column.id}
                      </div>
                    </button>
                  );
                })}
                {filteredColumns.length === 0 && (
                  <div className="px-2 py-6 text-center text-sm text-slate-500">
                    没有匹配字段
                  </div>
                )}
              </div>
            </section>

            <section className="mt-auto flex-none border-t border-slate-200/80 bg-white">
              <div className="border-b border-slate-200/80 bg-slate-50/70 px-3 py-2.5">
                <h3 className="text-sm font-semibold text-slate-800">添加备注</h3>
                {selectedColumn && currentRow ? (
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    针对当前数据：
                    <span className="mx-1 border border-slate-200 bg-white px-1.5 py-0.5">
                      第 {currentIndex + 1} 行
                    </span>
                    <span className="border border-slate-200 bg-white px-1.5 py-0.5">
                      {selectedColumn.header}
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    先在上方选择字段并定位到有效数据行后再添加备注
                  </p>
                )}
              </div>

              <div className="max-h-[42vh] space-y-3 overflow-y-auto px-3 py-3">
                {existingNotes.length > 0 && (
                  <div className="border border-slate-200/80 bg-slate-50/70">
                    <button
                      type="button"
                      onClick={() => setShowPreviousNotes(!showPreviousNotes)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left"
                      aria-label="切换历史备注"
                    >
                      <span className="text-sm font-medium text-slate-700">
                        历史备注（{existingNotes.length}）
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 text-primary transition-transform ${
                          showPreviousNotes ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {showPreviousNotes && (
                      <div className="space-y-2 border-t border-slate-200/80 px-3 py-2.5">
                        {existingNotes.map((note) => (
                          <div
                            key={note.id}
                            className="flex items-start gap-2 border border-slate-200/80 bg-white px-2.5 py-2"
                          >
                            <div className="flex-1 text-sm italic text-slate-600">
                              &ldquo;{note.note}&rdquo;
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-500 hover:bg-destructive/10"
                              onClick={() => removeBookmark(note.id)}
                              aria-label="删除备注"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <Textarea
                  placeholder="你对这个输出有什么看法？"
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="min-h-[110px] resize-y border-slate-200 bg-white text-sm leading-6"
                  aria-label="输入备注内容"
                  disabled={!selectedColumn || !currentRow}
                />

                <div className="flex items-center gap-2">
                  <Select value={feedbackColor} onValueChange={setFeedbackColor}>
                    <SelectTrigger
                      className="h-9 w-[118px] border-slate-200 bg-white"
                      disabled={!selectedColumn || !currentRow}
                    >
                      <SelectValue>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-4 w-4 rounded-full border"
                            style={{ backgroundColor: feedbackColor }}
                          />
                          <span>分类</span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="#FF0000">红色</SelectItem>
                      <SelectItem value="#00FF00">绿色</SelectItem>
                      <SelectItem value="#0000FF">蓝色</SelectItem>
                      <SelectItem value="#FFFF00">黄色</SelectItem>
                      <SelectItem value="#FF00FF">品红</SelectItem>
                      <SelectItem value="#00FFFF">青色</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    className="flex-1"
                    size="sm"
                    onClick={() => currentRow && handleSubmitFeedback(currentRow, feedbackText)}
                    disabled={!selectedColumn || !currentRow || !feedbackText.trim()}
                  >
                    添加备注
                  </Button>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
