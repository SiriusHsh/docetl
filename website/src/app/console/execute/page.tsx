"use client";

import dynamic from "next/dynamic";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Check,
  CircleDashed,
  Copy,
  Database,
  FileJson,
  FileText,
  MoreVertical,
  Pencil,
  Plus,
  Table2,
  Trash,
  X,
  ChevronLeft,
  ChevronRight,
  Terminal,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookmarkProvider } from "@/contexts/BookmarkContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PipelineProvider, usePipelineContext } from "@/contexts/PipelineContext";
import { PipelineStoreProvider, usePipelineStore } from "@/contexts/PipelineStoreContext";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { File } from "@/app/types";
import { backendFetch } from "@/lib/backendFetch";

const PipelineGUI = dynamic(() => import("@/components/PipelineGui"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center text-sm text-slate-500">
      正在加载执行画布...
    </div>
  ),
});

const Output = dynamic(
  () => import("@/components/Output").then((mod) => mod.Output),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-sm text-slate-500">
        正在加载输出视图...
      </div>
    ),
  }
);

const DatasetView = dynamic(() => import("@/components/DatasetView"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center text-sm text-slate-500">
      正在加载数据集预览...
    </div>
  ),
});

const DEFAULT_NAMESPACE = "default";

const formatRecordCount = (count: string) =>
  count === "-" ? "记录数未知" : `${count} 条记录`;

type DataSourceItem = {
  id: string;
  name: string;
  type: "json" | "csv" | "sql" | "text";
  recordCount: string;
  sourceLabel: string;
  file: File;
};

type DataCenterDataset = {
  id: string;
  name: string;
  path: string;
  source: string;
  format: string;
  original_format?: string | null;
  ingest_status: string;
  row_count?: number | null;
};

const formatDatasetSource = (source: string) => {
  if (source === "pipeline_generated") {
    return "流水线产出";
  }
  if (source === "user_upload") {
    return "用户上传";
  }
  return "数据中心";
};

const DataSourceIcon = ({ type }: { type: DataSourceItem["type"] }) => {
  switch (type) {
    case "json":
      return <FileJson className="w-4 h-4 text-yellow-500" />;
    case "csv":
      return <Table2 className="w-4 h-4 text-green-500" />;
    case "sql":
      return <Database className="w-4 h-4 text-blue-500" />;
    default:
      return <FileText className="w-4 h-4 text-slate-400" />;
  }
};

const ExecuteLeftPanel: React.FC<{
  availableDataSources: DataSourceItem[];
  selectedDataSource: DataSourceItem | null;
  hasStaleSelection: boolean;
  onSelectDataSource: (item: DataSourceItem) => void;
  onClearDataSource: () => void;
  isLoadingDataSources?: boolean;
  dataSourceError?: string | null;
}> = ({
  availableDataSources,
  selectedDataSource,
  hasStaleSelection,
  onSelectDataSource,
  onClearDataSource,
  isLoadingDataSources = false,
  dataSourceError = null,
}) => {
  const {
    pipelines,
    activePipelineId,
    switchPipeline,
    createPipeline,
    duplicatePipeline,
    deletePipeline,
    renamePipeline,
  } = usePipelineStore();

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [dataSourceDialogOpen, setDataSourceDialogOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const startRenaming = (pipelineId: string, name: string) => {
    setActiveMenuId(null);
    setEditingId(pipelineId);
    setEditName(name);
  };

  const saveRename = () => {
    if (editingId && editName.trim()) {
      void renamePipeline(editingId, editName.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex-1 min-h-0 shadow-sm">
        <div className="h-full bg-white border border-slate-200 rounded-lg p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                活跃流水线
              </h2>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                {pipelines.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void createPipeline()}
              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
              title="新建流水线"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 overflow-y-auto pr-2 flex-1 pb-4">
            {pipelines.map((pipeline) => {
              const isSelected = pipeline.id === activePipelineId;
              const isMenuOpen = activeMenuId === pipeline.id;
              const isEditing = editingId === pipeline.id;

              return (
                <div
                  key={pipeline.id}
                  onClick={() => {
                    if (!isEditing) {
                      void switchPipeline(pipeline.id);
                    }
                  }}
                  className={`relative group cursor-pointer p-3 rounded-md border transition-all duration-200 ${
                    isSelected
                      ? "bg-blue-50 border-blue-200 shadow-sm"
                      : "bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-start justify-between mb-1 min-h-[24px]">
                    {isEditing ? (
                      <div
                        className="flex items-center gap-1 flex-1 mr-2"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") saveRename();
                            if (event.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                          className="flex-1 bg-white border border-blue-400 rounded px-2 py-0.5 text-sm text-slate-900 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            saveRename();
                          }}
                          className="p-1 hover:text-emerald-400 text-slate-400"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingId(null);
                          }}
                          className="p-1 hover:text-red-400 text-slate-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`text-sm font-bold leading-tight truncate flex-1 pr-2 ${
                          isSelected ? "text-blue-700" : "text-slate-800"
                        }`}
                      >
                        {pipeline.name}
                      </span>
                    )}

                    {!isEditing && (
                      <div className="flex items-center gap-0.5 shrink-0 ml-1">
                        <div
                          className="flex items-center justify-center w-6 h-6"
                          title="Status"
                        >
                          {isSelected ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <CircleDashed className="w-3.5 h-3.5 text-slate-400" />
                          )}
                        </div>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveMenuId(isMenuOpen ? null : pipeline.id);
                            }}
                            className={`flex items-center justify-center w-6 h-6 rounded-md transition-all duration-200 ${
                              isMenuOpen
                                ? "bg-slate-100 text-slate-700 opacity-100"
                                : "text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-700"
                            }`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {isMenuOpen && (
                            <div
                              ref={menuRef}
                              className="absolute right-0 top-7 w-36 bg-white border border-slate-200 rounded-lg shadow-xl z-50 flex flex-col py-1"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startRenaming(pipeline.id, pipeline.name);
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                重命名
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void duplicatePipeline(pipeline.id);
                                  setActiveMenuId(null);
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors text-left"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                复制
                              </button>
                              <div className="h-px bg-slate-200 my-1 mx-2"></div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void deletePipeline(pipeline.id);
                                  setActiveMenuId(null);
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors text-left"
                              >
                                <Trash className="w-3.5 h-3.5" />
                                删除
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {pipelines.length === 0 ? (
              <div className="text-center py-8 text-slate-500 italic text-sm border border-dashed border-slate-200 rounded-lg">
                未配置流水线
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="h-[35%] min-h-[200px] shadow-sm">
        <div className="h-full bg-white border border-slate-200 rounded-lg p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              输入数据源
            </h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px] border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              onClick={() => setDataSourceDialogOpen(true)}
              disabled={isLoadingDataSources}
            >
              {selectedDataSource ? "更换" : "选择"}
            </Button>
          </div>
          <div className="space-y-3 overflow-y-auto pr-2 flex-1">
            {isLoadingDataSources ? (
              <div className="text-center py-8 text-slate-500 italic text-sm border border-dashed border-slate-200 rounded-lg">
                正在加载数据中心数据...
              </div>
            ) : dataSourceError ? (
              <div className="text-center py-8 text-red-600 text-sm border border-dashed border-red-200 rounded-lg">
                数据源加载失败
              </div>
            ) : selectedDataSource ? (
              <div className="flex items-center p-3 border rounded-md group transition-all bg-blue-50 border-blue-200 shadow-sm">
                <div className="p-2 rounded border mr-3 bg-blue-100 border-blue-200">
                  <DataSourceIcon type={selectedDataSource.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold truncate text-blue-700">
                      {selectedDataSource.name}
                    </span>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                      {selectedDataSource.type.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>
                      {formatRecordCount(selectedDataSource.recordCount)}
                    </span>
                    <span className="w-1 h-1 bg-slate-400 rounded-full"></span>
                    <span>{selectedDataSource.sourceLabel}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClearDataSource}
                  className="ml-2 p-1 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="移除数据源"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : hasStaleSelection ? (
              <div className="text-center py-6 text-slate-500 italic text-sm border border-dashed border-slate-200 rounded-lg space-y-3">
                <div>当前数据源不可用，请重新选择。</div>
                <button
                  type="button"
                  onClick={onClearDataSource}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100"
                >
                  <X className="w-3.5 h-3.5" />
                  移除数据源
                </button>
              </div>
            ) : availableDataSources.length === 0 ? (
              <div className="text-center py-8 text-slate-500 italic text-sm border border-dashed border-slate-200 rounded-lg">
                未配置数据源
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 italic text-sm border border-dashed border-slate-200 rounded-lg">
                请点击“选择”配置数据源
              </div>
            )}
          </div>
        </div>
      </div>
      <Dialog open={dataSourceDialogOpen} onOpenChange={setDataSourceDialogOpen}>
        <DialogContent className="bg-white border border-slate-200 text-slate-900 max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-slate-900">
              选择数据源
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {availableDataSources.length === 0 ? (
              <div className="text-center py-8 text-slate-500 italic text-sm border border-dashed border-slate-200 rounded-lg">
                数据中心暂无可用数据集
              </div>
            ) : (
              availableDataSources.map((ds) => {
                const isSelected = selectedDataSource?.id === ds.id;
                return (
                  <button
                    key={ds.id}
                    type="button"
                    onClick={() => {
                      onSelectDataSource(ds);
                      setDataSourceDialogOpen(false);
                    }}
                    className={`w-full flex items-center p-3 border rounded-md transition-all text-left ${
                      isSelected
                        ? "bg-blue-50 border-blue-200 shadow-sm"
                        : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className={`p-2 rounded border mr-3 ${
                        isSelected
                          ? "bg-blue-100 border-blue-200"
                          : "bg-slate-100 border-slate-200"
                      }`}
                    >
                      <DataSourceIcon type={ds.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-sm font-bold truncate ${
                            isSelected ? "text-blue-700" : "text-slate-800"
                          }`}
                        >
                          {ds.name}
                        </span>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                          {ds.type.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{formatRecordCount(ds.recordCount)}</span>
                        <span className="w-1 h-1 bg-slate-400 rounded-full"></span>
                        <span>{ds.sourceLabel}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ExecuteBottomPanel: React.FC = () => {
  const { terminalOutput, currentFile } = usePipelineContext();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"console" | "output" | "input">(
    "output"
  );

  const logLines = useMemo(() => {
    if (!terminalOutput) return [];
    return terminalOutput.split("\n").filter((line) => line.trim().length > 0);
  }, [terminalOutput]);

  useEffect(() => {
    if (!currentFile) return;
    setActiveTab("input");
    setIsOpen(true);
  }, [currentFile?.path]);

  return (
    <div
      className="fixed bottom-0 right-0 z-20 transition-all duration-300 ease-in-out bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(15,23,42,0.08)] flex flex-col"
      style={{ width: "calc(100% - 16rem)", height: isOpen ? "450px" : "40px" }}
    >
      <div className="h-10 flex items-center justify-between bg-slate-50 border-b border-slate-200 select-none">
        <div className="flex items-center h-full">
          <button
            type="button"
            onClick={() => {
              setActiveTab("console");
              setIsOpen(true);
            }}
            className={`h-full px-4 flex items-center gap-2 text-xs font-medium border-r border-slate-200 transition-colors ${
              activeTab === "console" && isOpen
                ? "bg-white text-blue-600 border-t-2 border-t-blue-500"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            执行控制台
            {logLines.length > 0 ? (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] border border-slate-200">
                {logLines.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("output");
              setIsOpen(true);
            }}
            className={`h-full px-4 flex items-center gap-2 text-xs font-medium border-r border-slate-200 transition-colors ${
              activeTab === "output" && isOpen
                ? "bg-white text-emerald-600 border-t-2 border-t-emerald-500"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Table2 className="w-3.5 h-3.5" />
            流水线输出
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("input");
              setIsOpen(true);
            }}
            className={`h-full px-4 flex items-center gap-2 text-xs font-medium border-r border-slate-200 transition-colors ${
              activeTab === "input" && isOpen
                ? "bg-white text-indigo-600 border-t-2 border-t-indigo-500"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            {currentFile ? `输入: ${currentFile.name}` : "输入数据"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="h-10 w-10 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
        >
          {isOpen ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative">
        <div
          className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${
            activeTab === "console" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
          }`}
        >
          <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-700">
            {logLines.length === 0 ? (
              <div className="text-slate-500 italic">暂无执行日志。</div>
            ) : (
              <pre className="whitespace-pre-wrap">{logLines.join("\n")}</pre>
            )}
          </div>
        </div>

        <div
          className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${
            activeTab === "output" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
          }`}
        >
          <div className="flex-1 min-h-0 overflow-hidden bg-white">
            <Output variant="execute" />
          </div>
        </div>

        <div
          className={`absolute inset-0 flex flex-col transition-opacity duration-200 ${
            activeTab === "input" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
          }`}
        >
          <div className="flex-1 min-h-0 overflow-hidden bg-white">
            {currentFile ? (
              <DatasetView file={currentFile} />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500">
                未选择数据源。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ExecuteWorkspace: React.FC = () => {
  const { namespace, setNamespace, currentFile, setCurrentFile } =
    usePipelineContext();
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [dataCenterDatasets, setDataCenterDatasets] = useState<
    DataCenterDataset[]
  >([]);
  const [dataCenterLoading, setDataCenterLoading] = useState(false);
  const [dataCenterError, setDataCenterError] = useState<string | null>(null);

  useEffect(() => {
    if (!namespace) {
      setNamespace(DEFAULT_NAMESPACE);
    }
  }, [namespace, setNamespace]);

  useEffect(() => {
    const loadDatasets = async () => {
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
          throw new Error(detail || "加载数据集失败");
        }
        const data = (await response.json()) as DataCenterDataset[];
        const normalized = data.filter(
          (dataset) =>
            dataset.format === "json" && dataset.ingest_status === "ready"
        );
        setDataCenterDatasets(normalized);
      } catch (err) {
        setDataCenterDatasets([]);
        setDataCenterError(
          err instanceof Error ? err.message : "加载数据集失败"
        );
      } finally {
        setDataCenterLoading(false);
      }
    };

    void loadDatasets();
  }, [namespace]);

  const availableDataSources = useMemo(() => {
    return dataCenterDatasets.map(
      (dataset): DataSourceItem => ({
        id: dataset.path,
        name: dataset.name,
        type: "json",
        recordCount: dataset.row_count != null ? String(dataset.row_count) : "-",
        sourceLabel: formatDatasetSource(dataset.source),
        file: {
          name: dataset.name,
          path: dataset.path,
          type: "json",
          parentFolder: "数据中心",
        },
      })
    );
  }, [dataCenterDatasets]);

  const selectedDataSource = useMemo(() => {
    if (!currentFile) {
      return null;
    }
    return (
      availableDataSources.find((item) => item.id === currentFile.path) || null
    );
  }, [availableDataSources, currentFile]);

  const hasStaleSelection = Boolean(currentFile && !selectedDataSource);

  return (
    <div className="flex h-screen flex-col min-w-0">
      <div className="flex-1 p-6 flex min-h-0 overflow-hidden pb-12">
        <div
          className={`flex flex-col gap-6 h-full flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
            isLeftPanelOpen
              ? "w-[400px] xl:w-[450px] 2xl:w-[500px] opacity-100"
              : "w-0 opacity-0"
          }`}
        >
          <ExecuteLeftPanel
            availableDataSources={availableDataSources}
            selectedDataSource={selectedDataSource}
            hasStaleSelection={hasStaleSelection}
            onSelectDataSource={(item) => setCurrentFile(item.file)}
            onClearDataSource={() => setCurrentFile(null)}
            isLoadingDataSources={dataCenterLoading}
            dataSourceError={dataCenterError}
          />
        </div>

        <div
          className="relative w-6 flex-shrink-0 flex flex-col items-center justify-center cursor-pointer group select-none z-20"
          onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
          title={isLeftPanelOpen ? "收起面板" : "展开面板"}
        >
          <div
            className={`w-[1px] h-full transition-colors duration-300 ${
              isLeftPanelOpen ? "bg-slate-200" : "bg-slate-200"
            } group-hover:bg-blue-500/50`}
          ></div>
          <div className="absolute top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-10 bg-white border border-slate-200 rounded-full transition-all duration-300 group-hover:border-blue-300 shadow-sm">
            {isLeftPanelOpen ? (
              <ChevronLeft className="w-3 h-3 text-slate-500 group-hover:text-blue-600" />
            ) : (
              <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-blue-600" />
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-lg h-full min-h-0 relative shadow-sm min-w-0">
          <PipelineGUI variant="execute" />
        </div>
      </div>
      <ExecuteBottomPanel />
    </div>
  );
};

const WebSocketWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { namespace } = usePipelineContext();

  return (
    <WebSocketProvider namespace={namespace || ""}>
      {children}
    </WebSocketProvider>
  );
};

export default function ExecutePage() {
  return (
    <ThemeProvider>
      <PipelineProvider>
        <PipelineStoreProvider>
          <WebSocketWrapper>
            <BookmarkProvider>
              <ExecuteWorkspace />
            </BookmarkProvider>
          </WebSocketWrapper>
        </PipelineStoreProvider>
      </PipelineProvider>
    </ThemeProvider>
  );
}
