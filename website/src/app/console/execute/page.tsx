"use client";

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

import PipelineGUI from "@/components/PipelineGui";
import { Output } from "@/components/Output";
import DatasetView from "@/components/DatasetView";
import { BookmarkProvider } from "@/contexts/BookmarkContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PipelineProvider, usePipelineContext } from "@/contexts/PipelineContext";
import { PipelineStoreProvider, usePipelineStore } from "@/contexts/PipelineStoreContext";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import { File } from "@/app/types";

const DEFAULT_NAMESPACE = "default";

const formatFileSize = (bytes?: number | null): string => {
  if (!bytes || bytes <= 0) {
    return "未知大小";
  }
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / Math.pow(1024, exponent);
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
};

type DataSourceItem = {
  id: string;
  name: string;
  type: "json" | "csv" | "sql" | "text";
  recordCount: string;
  size: string;
  file: File;
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
  dataSources: DataSourceItem[];
  activeDataSourceId: string | null;
  onSelectDataSource: (item: DataSourceItem) => void;
}> = ({ dataSources, activeDataSourceId, onSelectDataSource }) => {
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
      <div className="flex-1 min-h-0 shadow-lg shadow-black/20">
        <div className="h-full bg-[#151921] border border-slate-800 rounded-lg p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                活跃流水线
              </h2>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                {pipelines.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void createPipeline()}
              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded transition-colors"
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
                      ? "bg-blue-900/20 border-blue-500/50 shadow-sm shadow-blue-500/10"
                      : "bg-[#0B0E14] border-slate-800 hover:border-slate-700 hover:bg-slate-900"
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
                          className="flex-1 bg-slate-950 border border-blue-500 rounded px-2 py-0.5 text-sm text-slate-200 focus:outline-none"
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
                          isSelected ? "text-blue-200" : "text-slate-200"
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
                            <CircleDashed className="w-3.5 h-3.5 text-slate-600" />
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
                                ? "bg-slate-700 text-white opacity-100"
                                : "text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-slate-800 hover:text-slate-200"
                            }`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {isMenuOpen && (
                            <div
                              ref={menuRef}
                              className="absolute right-0 top-7 w-36 bg-[#1e2330] border border-slate-700 rounded-lg shadow-xl z-50 flex flex-col py-1"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startRenaming(pipeline.id, pipeline.name);
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors text-left"
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
                                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700/50 hover:text-white transition-colors text-left"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                复制
                              </button>
                              <div className="h-px bg-slate-700/50 my-1 mx-2"></div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void deletePipeline(pipeline.id);
                                  setActiveMenuId(null);
                                }}
                                className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors text-left"
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
              <div className="text-center py-8 text-slate-500 italic text-sm border border-dashed border-slate-700 rounded-lg">
                未配置流水线
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="h-[35%] min-h-[200px] shadow-lg shadow-black/20">
        <div className="h-full bg-[#151921] border border-slate-800 rounded-lg p-5 flex flex-col">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">
            输入数据源
          </h2>
          <div className="space-y-3 overflow-y-auto pr-2 flex-1">
            {dataSources.length === 0 ? (
              <div className="text-center py-8 text-slate-500 italic text-sm border border-dashed border-slate-700 rounded-lg">
                未配置数据源
              </div>
            ) : (
              dataSources.map((ds) => {
                const isSelected = activeDataSourceId === ds.id;
                return (
                  <div
                    key={ds.id}
                    onClick={() => onSelectDataSource(ds)}
                    className={`flex items-center p-3 border rounded-md group transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-900/20 border-blue-500/50 shadow-sm shadow-blue-500/10"
                        : "bg-[#0B0E14] border-slate-800 hover:border-slate-700 hover:bg-slate-900"
                    }`}
                  >
                    <div
                      className={`p-2 rounded border mr-3 transition-colors ${
                        isSelected
                          ? "bg-blue-900/30 border-blue-800"
                          : "bg-slate-900 border-slate-800"
                      }`}
                    >
                      <DataSourceIcon type={ds.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-sm font-bold truncate ${
                            isSelected ? "text-blue-200" : "text-slate-200"
                          }`}
                        >
                          {ds.name}
                        </span>
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                          {ds.type.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{ds.recordCount} 条记录</span>
                        <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                        <span>{ds.size}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
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

  return (
    <div
      className="fixed bottom-0 right-0 z-20 transition-all duration-300 ease-in-out bg-[#0B0E14] border-t border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.4)] flex flex-col"
      style={{ width: "calc(100% - 16rem)", height: isOpen ? "450px" : "40px" }}
    >
      <div className="h-10 flex items-center justify-between bg-[#151921] border-b border-slate-800 select-none">
        <div className="flex items-center h-full">
          <button
            type="button"
            onClick={() => {
              setActiveTab("console");
              setIsOpen(true);
            }}
            className={`h-full px-4 flex items-center gap-2 text-xs font-medium border-r border-slate-800 transition-colors ${
              activeTab === "console" && isOpen
                ? "bg-[#0B0E14] text-blue-400 border-t-2 border-t-blue-500"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            执行控制台
            {logLines.length > 0 ? (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] border border-slate-700">
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
            className={`h-full px-4 flex items-center gap-2 text-xs font-medium border-r border-slate-800 transition-colors ${
              activeTab === "output" && isOpen
                ? "bg-[#0B0E14] text-emerald-400 border-t-2 border-t-emerald-500"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
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
            className={`h-full px-4 flex items-center gap-2 text-xs font-medium border-r border-slate-800 transition-colors ${
              activeTab === "input" && isOpen
                ? "bg-[#0B0E14] text-indigo-400 border-t-2 border-t-indigo-500"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            {currentFile ? `输入: ${currentFile.name}` : "输入数据"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="h-10 w-10 flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
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
          <div className="flex-1 overflow-auto p-4 font-mono text-xs text-slate-300">
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
            <Output />
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
  const { namespace, setNamespace, files, currentFile, setCurrentFile } =
    usePipelineContext();
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);

  useEffect(() => {
    if (!namespace) {
      setNamespace(DEFAULT_NAMESPACE);
    }
  }, [namespace, setNamespace]);

  const dataSources = useMemo(() => {
    const base = files
      .filter((file) => file.type === "json")
      .map((file) => ({
        id: file.path,
        name: file.name,
        type: "json" as const,
        recordCount: "-",
        size: formatFileSize(file.blob?.size ?? null),
        file,
      }));

    if (currentFile && !base.some((item) => item.id === currentFile.path)) {
      base.unshift({
        id: currentFile.path,
        name: currentFile.name,
        type: "json" as const,
        recordCount: "-",
        size: formatFileSize(currentFile.blob?.size ?? null),
        file: currentFile,
      });
    }

    return base;
  }, [files, currentFile]);

  const activeDataSourceId = currentFile?.path ?? null;

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
            dataSources={dataSources}
            activeDataSourceId={activeDataSourceId}
            onSelectDataSource={(item) => setCurrentFile(item.file)}
          />
        </div>

        <div
          className="relative w-6 flex-shrink-0 flex flex-col items-center justify-center cursor-pointer group select-none z-20"
          onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
          title={isLeftPanelOpen ? "收起面板" : "展开面板"}
        >
          <div
            className={`w-[1px] h-full transition-colors duration-300 ${
              isLeftPanelOpen ? "bg-slate-800" : "bg-slate-700"
            } group-hover:bg-blue-500/50`}
          ></div>
          <div className="absolute top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-10 bg-[#0B0E14] border border-slate-700 rounded-full transition-all duration-300 group-hover:border-blue-500/50 shadow-sm">
            {isLeftPanelOpen ? (
              <ChevronLeft className="w-3 h-3 text-slate-500 group-hover:text-blue-400" />
            ) : (
              <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-blue-400" />
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-[#0B0E14] border border-slate-800 rounded-lg h-full min-h-0 relative shadow-xl shadow-black/20 min-w-0">
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
