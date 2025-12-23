import React, { useState, useEffect } from 'react';
import { 
  ChevronUp, ChevronDown, Terminal, Clock, AlertCircle, CheckCircle, 
  Table as TableIcon, Download, Search, RotateCcw, Columns, 
  ChevronLeft, ChevronRight, Database
} from 'lucide-react';
import { ConsoleLog, DataSource } from '../types';

// Mock data for the output table
const MOCK_OUTPUT_DATA = [
  { id: 'out-1', hash: 'e4b2c1', analysis: 'Confirmed Fix', type: 'Buffer Overflow', component: 'drivers/net/wireless', confidence: '0.98' },
  { id: 'out-2', hash: 'a1d3f5', analysis: 'Feature Addition', type: 'N/A', component: 'fs/ext4', confidence: '0.12' },
  { id: 'out-3', hash: 'b7c8d9', analysis: 'Confirmed Fix', type: 'Null Pointer Dereference', component: 'kernel/sched', confidence: '0.95' },
  { id: 'out-4', hash: 'f2e4a1', analysis: 'Refactoring', type: 'N/A', component: 'mm/memory', confidence: '0.05' },
  { id: 'out-5', hash: 'c9b1a2', analysis: 'Confirmed Fix', type: 'Race Condition', component: 'net/ipv4', confidence: '0.91' },
];

// Mock data for input sources
const MOCK_INPUT_DATA: Record<string, any[]> = {
  // Linux CVE Pipeline Data
  'ds-cve-1': [ // linux_kernel_git
    { hash: '4b3a2c1', author: 'Linus Torvalds', date: '2024-03-15', message: 'Linux 6.8-rc7' },
    { hash: '8d2f1e4', author: 'Greg Kroah-Hartman', date: '2024-03-14', message: 'USB: serial: option: add Telit LE910C1-EUX compositions' },
    { hash: '1a9b8c7', author: 'Paolo Abeni', date: '2024-03-14', message: 'net: fix potential use-after-free in net_namespace' },
    { hash: '3e5d7f2', author: 'Jens Axboe', date: '2024-03-13', message: 'io_uring: fix overflow check in io_pin_pages' },
    { hash: '9c4a6b2', author: 'Dave Airlie', date: '2024-03-13', message: 'drm/amdgpu: fix null pointer dereference in display logic' },
  ],
  'ds-cve-2': [ // nvd_feed_2024
    { cve_id: 'CVE-2024-1001', published: '2024-01-05', severity: 'HIGH', score: 7.8, description: 'Buffer overflow in network driver...' },
    { cve_id: 'CVE-2024-1002', published: '2024-01-12', severity: 'CRITICAL', score: 9.8, description: 'Remote code execution in SMB...' },
    { cve_id: 'CVE-2024-1003', published: '2024-01-15', severity: 'MEDIUM', score: 5.4, description: 'Information disclosure in /proc...' },
    { cve_id: 'CVE-2024-1004', published: '2024-02-01', severity: 'LOW', score: 3.2, description: 'Local denial of service via syscall...' },
    { cve_id: 'CVE-2024-1005', published: '2024-02-10', severity: 'HIGH', score: 8.1, description: 'Privilege escalation in scheduler...' },
  ],
  
  // Data Quality Pipeline Data
  'ds-dq-1': [ // crm_interactions_raw
    { id: 'INT-001', user_id: 'U8821', type: 'purchase', amt: 120.50, timestamp: '2024-03-10 10:00:00', device: 'iOS' },
    { id: 'INT-002', user_id: 'U9932', type: 'view', amt: 0.00, timestamp: '2024-03-10 10:05:22', device: 'Android' },
    { id: 'INT-003', user_id: '', type: 'error', amt: null, timestamp: '2024-03-10 10:06:15', device: 'Web' },
    { id: 'INT-004', user_id: 'U7711', type: 'purchase', amt: 5500.00, timestamp: '2024-03-10 10:12:00', device: 'unknown' },
    { id: 'INT-005', user_id: 'U8821', type: 'refund', amt: -120.50, timestamp: '2024-03-10 11:30:00', device: 'iOS' },
  ],

  // Expert CoT Pipeline Data
  'ds-cot-1': [ // expert_reasoning_traces
    { trace_id: 'TR-101', domain: 'math', question: 'Solve integral x^2...', steps: 5, quality: 'High' },
    { trace_id: 'TR-102', domain: 'coding', question: 'Optimize quicksort...', steps: 8, quality: 'Medium' },
    { trace_id: 'TR-103', domain: 'medical', question: 'Diagnose symptoms...', steps: 12, quality: 'High' },
  ]
};

interface BottomPanelProps {
  logs: ConsoleLog[];
  activeDataSource: DataSource | null;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({ logs, activeDataSource }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'console' | 'output' | 'input'>('output');

  // Automatically switch to input tab if a data source is selected
  useEffect(() => {
    if (activeDataSource) {
      setActiveTab('input');
      setIsOpen(true);
    }
  }, [activeDataSource]);

  // Helper to render table based on data array
  const renderTable = (data: any[]) => {
    if (!data || data.length === 0) return <div className="p-8 text-center text-slate-500 italic">此来源暂无预览数据。</div>;
    
    const headers = Object.keys(data[0]);
    
    return (
        <div className="flex-1 overflow-auto custom-scrollbar bg-white dark:bg-[#020617]">
            <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 dark:bg-[#0B0E14] z-10 shadow-sm">
                     <tr>
                        {headers.map((header) => (
                            <th key={`${header}-filter`} className="p-2 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0E14] last:border-r-0 min-w-[150px]">
                                <div className="relative">
                                    <Search className="absolute left-2 top-1.5 w-3 h-3 text-slate-400 dark:text-slate-500" />
                                    <div className="text-[10px] absolute right-2 top-2 text-slate-500 dark:text-slate-600 font-mono uppercase">{header}</div>
                                    <input 
                                        type="text" 
                                        placeholder="过滤..." 
                                        className="w-full bg-white dark:bg-[#151921] border border-slate-300 dark:border-slate-700 rounded pl-7 pr-2 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-500 placeholder-slate-400 dark:placeholder-slate-600"
                                    />
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs text-slate-700 dark:text-slate-300 font-mono">
                    {data.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors group">
                             {headers.map((header) => (
                                <td key={`${idx}-${header}`} className="p-3 border-r border-slate-200 dark:border-slate-800 align-top group-hover:border-slate-300 dark:group-hover:border-slate-700 whitespace-nowrap overflow-hidden text-ellipsis max-w-[300px]">
                                    {String(row[header])}
                                </td>
                             ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
  };

  return (
    <div 
      className={`fixed bottom-0 right-0 z-20 transition-all duration-300 ease-in-out bg-white dark:bg-[#0B0E14] border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.4)] flex flex-col`}
      style={{ width: 'calc(100% - 16rem)', height: isOpen ? '450px' : '40px' }}
    >
      
      {/* Main Tab Header */}
      <div 
        className="h-10 flex items-center justify-between bg-slate-50 dark:bg-[#151921] border-b border-slate-200 dark:border-slate-800 select-none"
      >
        <div className="flex items-center h-full">
            {/* Console Tab */}
            <button 
                onClick={() => { setActiveTab('console'); setIsOpen(true); }}
                className={`h-full px-4 flex items-center gap-2 text-xs font-medium border-r border-slate-200 dark:border-slate-800 transition-colors ${
                    activeTab === 'console' && isOpen 
                    ? 'bg-white dark:bg-[#0B0E14] text-blue-700 dark:text-blue-400 border-t-2 border-t-blue-500' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
            >
                <Terminal className="w-3.5 h-3.5" />
                执行控制台
                {logs.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 text-[10px] border border-slate-300 dark:border-slate-700">
                        {logs.length}
                    </span>
                )}
            </button>

            {/* Output Tab */}
            <button 
                onClick={() => { setActiveTab('output'); setIsOpen(true); }}
                className={`h-full px-4 flex items-center gap-2 text-xs font-medium border-r border-slate-200 dark:border-slate-800 transition-colors ${
                    activeTab === 'output' && isOpen 
                    ? 'bg-white dark:bg-[#0B0E14] text-emerald-700 dark:text-emerald-400 border-t-2 border-t-emerald-500' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
            >
                <TableIcon className="w-3.5 h-3.5" />
                流水线输出
            </button>

             {/* Input Data Tab (Visible when data source is selected or if previously active) */}
            <button 
                onClick={() => { setActiveTab('input'); setIsOpen(true); }}
                className={`h-full px-4 flex items-center gap-2 text-xs font-medium border-r border-slate-200 dark:border-slate-800 transition-colors ${
                    activeTab === 'input' && isOpen 
                    ? 'bg-white dark:bg-[#0B0E14] text-indigo-700 dark:text-indigo-400 border-t-2 border-t-indigo-500' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                } ${!activeDataSource && activeTab !== 'input' ? 'opacity-50 hover:opacity-100' : ''}`}
            >
                <Database className="w-3.5 h-3.5" />
                {activeDataSource ? `输入: ${activeDataSource.name}` : '输入数据'}
            </button>
        </div>

        {/* Toggle Button */}
        <button 
            onClick={() => setIsOpen(!isOpen)}
            className="h-10 w-10 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
        >
           {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        
        {/* CONSOLE VIEW */}
        <div className={`absolute inset-0 bg-white dark:bg-[#020617] flex flex-col transition-opacity duration-200 ${activeTab === 'console' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
             <div className="flex-1 overflow-auto p-4 font-mono text-xs custom-scrollbar">
                {logs.length === 0 ? (
                <div className="text-slate-500 dark:text-slate-600 italic">暂无执行日志。</div>
                ) : (
                <div className="space-y-1.5">
                    {logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-white/5 p-1 rounded group">
                        <span className="text-slate-500 dark:text-slate-600 min-w-[80px]">{log.timestamp}</span>
                        <span className="mt-0.5">
                            {log.level === 'info' && <Clock className="w-3 h-3 text-blue-600 dark:text-blue-500" />}
                            {log.level === 'warning' && <AlertCircle className="w-3 h-3 text-yellow-600 dark:text-yellow-500" />}
                            {log.level === 'error' && <AlertCircle className="w-3 h-3 text-red-600 dark:text-red-500" />}
                            {log.level === 'success' && <CheckCircle className="w-3 h-3 text-emerald-600 dark:text-emerald-500" />}
                        </span>
                        <span className={`${
                        log.level === 'error' ? 'text-red-600 dark:text-red-400' : 
                        log.level === 'success' ? 'text-emerald-700 dark:text-emerald-400' : 
                        log.level === 'warning' ? 'text-yellow-700 dark:text-yellow-400' : 'text-slate-800 dark:text-slate-300'
                        }`}>
                        {log.message}
                        </span>
                    </div>
                    ))}
                </div>
                )}
            </div>
        </div>

        {/* OUTPUT VIEW */}
        <div className={`absolute inset-0 bg-white dark:bg-[#0B0E14] flex flex-col transition-opacity duration-200 ${activeTab === 'output' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
            <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0E14] text-xs">
                 <button className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    <Columns className="w-3.5 h-3.5" />
                    显示/隐藏列
                    <ChevronDown className="w-3 h-3" />
                 </button>
                 <button className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" />
                    重置宽度
                 </button>
                 
                 <div className="flex-1"></div>
                 
                 <button className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                    <Download className="w-4 h-4" />
                </button>
                 <div className="h-4 w-px bg-slate-300 dark:bg-slate-800 mx-2"></div>
                 
                 <div className="flex items-center gap-2 text-slate-400">
                    <button className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded disabled:opacity-50" disabled><ChevronLeft className="w-3.5 h-3.5" /></button>
                    <span>第 1 页 / 共 1 页</span>
                    <button className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded disabled:opacity-50" disabled><ChevronRight className="w-3.5 h-3.5" /></button>
                 </div>
            </div>
            {renderTable(MOCK_OUTPUT_DATA)}
        </div>

        {/* INPUT VIEW */}
        <div className={`absolute inset-0 bg-white dark:bg-[#0B0E14] flex flex-col transition-opacity duration-200 ${activeTab === 'input' ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
             <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0E14] text-xs">
                 <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
                    <Database className="w-3.5 h-3.5" />
                    <span className="font-semibold">{activeDataSource ? activeDataSource.name : '选择数据源'}</span>
                 </div>
                 
                 <div className="flex-1"></div>
                 
                 <button className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                    <Download className="w-4 h-4" />
                </button>
            </div>
            {activeDataSource && MOCK_INPUT_DATA[activeDataSource.id] 
                ? renderTable(MOCK_INPUT_DATA[activeDataSource.id]) 
                : <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm">
                    {activeDataSource ? '此来源暂无预览数据。' : '从左侧面板选择数据源以预览内容。'}
                  </div>
            }
        </div>

      </div>
    </div>
  );
};