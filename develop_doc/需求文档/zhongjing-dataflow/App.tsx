import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { PipelineSelector } from './components/PipelineSelector';
import { PipelineDetails } from './components/PipelineDetails';
import { OperationCard } from './components/OperationCard';
import { BottomPanel } from './components/BottomPanel';
import { mockPipelines } from './mockData';
import { Plus, Play, RotateCw, Square, ChevronLeft, ChevronRight } from 'lucide-react';
import { ConsoleLog, Pipeline, DataSource } from './types';

export default function App() {
  // Theme State - Default to Light (false)
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Apply theme class to a wrapper or document
  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  // Move pipelines to state to allow modifications
  const [pipelines, setPipelines] = useState<Pipeline[]>(mockPipelines);
  const [activePipelineId, setActivePipelineId] = useState<string>(mockPipelines[0].id);
  
  const [logs, setLogs] = useState<ConsoleLog[]>([
    { id: '1', timestamp: '10:00:01', level: 'info', message: 'Zhongjing DataFlow 引擎初始化完成' },
    { id: '2', timestamp: '10:00:05', level: 'success', message: '已挂载 Linux Kernel Git 仓库 (v6.8-rc)' },
    { id: '3', timestamp: '10:00:08', level: 'info', message: 'NVD CVE Feed 同步完成，新增 12 个条目' },
  ]);
  
  // Expanded State for Inline Editing
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  
  // Left Panel Visibility State
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);

  // Selected Data Source for Preview
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource | null>(null);

  // Derive active pipeline from state, fallback safely if list is empty or ID not found
  const activePipeline = pipelines.find(p => p.id === activePipelineId) || pipelines[0] || null;

  // Reset selected data source when pipeline changes
  useEffect(() => {
    setSelectedDataSource(null);
  }, [activePipelineId]);

  const handleRun = () => {
    if (!activePipeline) return;
    const newLog: ConsoleLog = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: `开始执行流水线: ${activePipeline.name}`
    };
    setLogs(prev => [newLog, ...prev]);
  };

  const handleNodeToggle = (id: string) => {
    setExpandedStepId(currentId => currentId === id ? null : id);
  };

  const handleSaveNode = (id: string, newDesc: string, newContent: string) => {
    // Update local state for pipelines
    setPipelines(prevPipelines => prevPipelines.map(p => {
        if (p.id === activePipelineId) {
            return {
                ...p,
                steps: p.steps.map(s => 
                    s.id === id ? { ...s, description: newDesc, content: newContent } : s
                )
            };
        }
        return p;
    }));

    const newLog: ConsoleLog = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      level: 'success',
      message: `已更新节点配置: ${id}`
    };
    setLogs(prev => [newLog, ...prev]);
  };

  // --- Pipeline CRUD Operations ---

  const handleCreatePipeline = () => {
    const newPipeline: Pipeline = {
      id: `p-${Date.now()}`,
      name: '未命名流水线',
      description: '新的空流水线配置',
      status: 'draft',
      dataSources: [],
      steps: []
    };
    setPipelines(prev => [...prev, newPipeline]);
    setActivePipelineId(newPipeline.id);
  };

  const handleDuplicatePipeline = (id: string) => {
    const source = pipelines.find(p => p.id === id);
    if (!source) return;

    const newPipeline: Pipeline = {
      ...source,
      id: `p-${Date.now()}`,
      name: `${source.name} (副本)`,
      status: 'draft',
      lastRun: undefined,
      // Deep copy steps to avoid reference issues if we edit them later
      steps: source.steps.map(s => ({ ...s, id: `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` }))
    };
    setPipelines(prev => [...prev, newPipeline]);
  };

  const handleRenamePipeline = (id: string, newName: string) => {
    setPipelines(prev => prev.map(p => 
      p.id === id ? { ...p, name: newName } : p
    ));
  };

  const handleDeletePipeline = (id: string) => {
    // If deleting the active one, switch to another one
    if (id === activePipelineId) {
      const remaining = pipelines.filter(p => p.id !== id);
      if (remaining.length > 0) {
        setActivePipelineId(remaining[0].id);
      }
    }
    setPipelines(prev => prev.filter(p => p.id !== id));
  };

  return (
    // Top-level div handles the "dark" class toggle for subtree
    <div className={`${isDarkMode ? 'dark' : ''} flex h-screen font-sans overflow-hidden text-slate-900 dark:text-slate-200`}>
      <div className="flex w-full h-full bg-slate-50 dark:bg-[#020617] transition-colors duration-300">
        
        {/* Sidebar */}
        <Sidebar isDarkMode={isDarkMode} toggleTheme={toggleTheme} />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 relative h-screen">
          
          {/* Main Flex Layout */}
          <div className="flex-1 p-6 flex min-h-0 overflow-hidden pb-12">
            
            {/* LEFT COLUMN: Pipelines & Data Sources */}
            <div 
              className={`flex flex-col gap-6 h-full flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
                isLeftPanelOpen ? 'w-[400px] xl:w-[450px] 2xl:w-[500px] opacity-100' : 'w-0 opacity-0'
              }`}
            >
              {/* Active Pipelines */}
              <div className="flex-1 min-h-0 shadow-lg shadow-slate-200/50 dark:shadow-black/20 whitespace-nowrap">
                <PipelineSelector 
                  pipelines={pipelines} 
                  selectedId={activePipelineId}
                  onSelect={setActivePipelineId}
                  onCreate={handleCreatePipeline}
                  onDuplicate={handleDuplicatePipeline}
                  onDelete={handleDeletePipeline}
                  onRename={handleRenamePipeline}
                />
              </div>
              
              {/* Data Sources */}
              <div className="h-[35%] min-h-[200px] shadow-lg shadow-slate-200/50 dark:shadow-black/20 whitespace-nowrap">
                {activePipeline ? (
                  <PipelineDetails 
                    pipeline={activePipeline}
                    onSelectDataSource={setSelectedDataSource}
                    selectedDataSourceId={selectedDataSource?.id || null}
                  />
                ) : (
                  <div className="h-full bg-white dark:bg-[#151921] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex items-center justify-center text-slate-500">
                      未选择流水线
                  </div>
                )}
              </div>
            </div>

            {/* DIVIDER & COLLAPSE CONTROL */}
            <div 
              className="relative w-6 flex-shrink-0 flex flex-col items-center justify-center cursor-pointer group select-none z-20"
              onClick={() => setIsLeftPanelOpen(!isLeftPanelOpen)}
              title={isLeftPanelOpen ? "收起面板" : "展开面板"}
            >
              {/* The vertical line */}
              <div className={`w-[1px] h-full transition-colors duration-300 ${isLeftPanelOpen ? 'bg-slate-200 dark:bg-slate-800' : 'bg-slate-300 dark:bg-slate-700'} group-hover:bg-blue-400 dark:group-hover:bg-blue-500/50`}></div>
              
              {/* The button handle */}
              <div className={`absolute top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-5 h-10 bg-white dark:bg-[#020617] border border-slate-200 dark:border-slate-700 rounded-full transition-all duration-300 group-hover:border-blue-400 dark:group-hover:border-blue-500/50 shadow-sm`}>
                  {isLeftPanelOpen ? <ChevronLeft className="w-3 h-3 text-slate-500 group-hover:text-blue-500 dark:group-hover:text-blue-400" /> : <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-blue-500 dark:group-hover:text-blue-400" />}
              </div>
            </div>

            {/* RIGHT COLUMN: Execution Flow */}
            <div className="flex-1 flex flex-col bg-white dark:bg-[#0B0E14] border border-slate-200 dark:border-slate-800 rounded-lg h-full min-h-0 relative shadow-xl shadow-slate-200/50 dark:shadow-black/20 min-w-0 transition-colors duration-300">
              
              {/* Header & Toolbar */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0E14] rounded-t-lg z-10">
                  <div className="flex items-center gap-4">
                    {/* Updated Header Style */}
                    <h3 className="text-sm uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400">执行流程</h3>
                  </div>
                  
                  {/* Actions Toolbar */}
                  <div className="flex items-center gap-3">
                    <button 
                      disabled={!activePipeline}
                      className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      停止
                    </button>
                    <button 
                      disabled={!activePipeline}
                      className="flex items-center gap-2 px-3 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-[#1e2330] rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      重新运行
                    </button>
                    <button 
                      onClick={handleRun}
                      disabled={!activePipeline}
                      className="flex items-center gap-2 px-4 py-1.5 text-white bg-blue-600 hover:bg-blue-500 rounded-md text-xs font-medium shadow-md shadow-blue-500/20 dark:shadow-blue-900/20 transition-all hover:scale-105 disabled:opacity-50 disabled:bg-slate-400 dark:disabled:bg-slate-700"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      运行
                    </button>
                  </div>
              </div>

              {/* Scrollable Canvas */}
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50/50 dark:bg-[#0B0E14]/30">
                  <div className="w-full max-w-5xl 2xl:max-w-7xl mx-auto pb-10 transition-all duration-300">
                    {/* Nodes Stack */}
                    <div className="space-y-6 relative">
                      {/* Vertical Line Connector */}
                      {activePipeline && activePipeline.steps.length > 0 && (
                        <div className="absolute top-4 bottom-4 left-[3.25rem] w-px bg-slate-200 dark:bg-slate-800 -z-10"></div>
                      )}

                      {!activePipeline ? (
                          <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-500">
                            选择或创建一个流水线以查看详情。
                          </div>
                      ) : activePipeline.steps.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900/20">
                            <p className="text-slate-500 mb-4">尚未配置任何操作</p>
                            <button className="flex items-center gap-2 px-4 py-2 text-blue-600 dark:text-blue-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors">
                              <Plus className="w-4 h-4" /> 添加第一步
                            </button>
                        </div>
                      ) : (
                        activePipeline.steps.map((step, index) => (
                          <OperationCard 
                            key={step.id} 
                            step={step} 
                            index={index}
                            isExpanded={expandedStepId === step.id}
                            onToggle={() => handleNodeToggle(step.id)}
                            onSave={handleSaveNode}
                          />
                        ))
                      )}

                      {/* Add Button at Bottom of Flow */}
                      {activePipeline && activePipeline.steps.length > 0 && (
                        <button className="w-full py-4 border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600 text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg flex items-center justify-center gap-2 transition-all duration-200 group bg-slate-50/50 dark:bg-transparent">
                          <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                          添加操作
                        </button>
                      )}
                    </div>
                  </div>
              </div>
            </div>
            
          </div>

          {/* Bottom Panel (Fixed) */}
          <BottomPanel logs={logs} activeDataSource={selectedDataSource} />
        </div>
      </div>
    </div>
  );
}