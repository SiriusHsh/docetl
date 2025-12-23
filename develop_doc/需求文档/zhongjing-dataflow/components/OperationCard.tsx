import React, { useState, useEffect, useRef } from 'react';
import { OperationStep } from '../types';
import { MoreHorizontal, List, ChevronRight, Save, FileCode, ChevronDown, ArrowUp, Settings, EyeOff, Trash, AlignLeft } from 'lucide-react';

interface OperationCardProps {
  step: OperationStep;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onSave: (id: string, newDescription: string, newContent: string) => void;
}

export const OperationCard: React.FC<OperationCardProps> = ({ step, index, isExpanded, onToggle, onSave }) => {
  const [description, setDescription] = useState(step.description || ''); // Short summary
  const [content, setContent] = useState(step.content || '');           // Script/Code/Content
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync state when step changes or re-opens
  useEffect(() => {
    setDescription(step.description || '');
    setContent(step.content || '');
  }, [step.description, step.content, isExpanded]);

  // Handle click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSave(step.id, description, content);
    onToggle(); // Collapse after save
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDescription(step.description || '');
    setContent(step.content || '');
    onToggle();
  };

  // Determine badge color based on type
  const getBadgeStyle = (type: string) => {
    switch (type) {
      case 'split': return 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700/50';
      case 'generate': return 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700/50';
      case 'map': return 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700/50';
      case 'reduce': return 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700/50';
      default: return 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600';
    }
  };

  const isRunning = step.status === 'running';
  const progress = step.progress || 0;

  return (
    <div 
      onClick={onToggle}
      className={`group relative w-full bg-white dark:bg-[#151921] border transition-all duration-300 ease-in-out
        ${isExpanded 
          ? 'border-blue-400 dark:border-blue-500/50 ring-1 ring-blue-500/20 shadow-xl z-10 scale-[1.01]' 
          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-[#1a1f2b] cursor-pointer'} 
        rounded-lg`}
    >
      {/* Connecting Line (visual only) */}
      {index > 0 && (
        <div className="absolute -top-6 left-8 w-0.5 h-6 bg-slate-300 dark:bg-slate-700 group-hover:bg-slate-400 dark:group-hover:bg-slate-600 transition-colors"></div>
      )}
      
      {/* Header Section */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4 flex-1 min-w-0 mr-4">
            {/* Badge */}
            <div className={`px-2 py-1 rounded text-xs font-mono font-bold border uppercase tracking-wider shrink-0 ${getBadgeStyle(step.type)}`}>
              {step.type}
            </div>
            
            {/* Content */}
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-blue-200 transition-colors flex items-center gap-2 truncate">
                {step.name}
                {!isExpanded && <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-all transform -translate-x-2 group-hover:translate-x-0 shrink-0" />}
              </h3>
              {/* Always show description in collapsed mode if available */}
              {!isExpanded && step.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-1 break-all">{step.description}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 relative shrink-0">
            {isExpanded ? (
               <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-500 dark:text-slate-400">
                  <ChevronDown className="w-4 h-4" />
               </div>
            ) : (
              <>
                 <button 
                    onClick={(e) => { e.stopPropagation(); /* Logic for outputs */ }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-[#1e2330] hover:bg-slate-200 dark:hover:bg-[#2a3040] text-slate-700 dark:text-slate-300 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 transition-colors opacity-80 group-hover:opacity-100 whitespace-nowrap shrink-0"
                 >
                  <List className="w-3.5 h-3.5 shrink-0" />
                  显示输出
                </button>
                
                {/* Menu Button & Dropdown */}
                <div className="relative" ref={menuRef}>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(!showMenu);
                    }}
                    className={`p-1.5 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors ${
                      showMenu 
                        ? 'opacity-100 text-slate-900 dark:text-slate-100 bg-slate-200 dark:bg-slate-700' 
                        : 'text-slate-400 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {/* Dropdown Menu */}
                  {showMenu && (
                    <div 
                      className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#1e2330] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 flex flex-col py-1 animate-in fade-in zoom-in-95 duration-100 origin-top-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-colors text-left w-full">
                        <ArrowUp className="w-3.5 h-3.5" />
                        上移
                      </button>
                      
                      <div className="h-px bg-slate-200 dark:bg-slate-700/50 my-1 mx-2"></div>
                      
                      <button className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-colors text-left w-full">
                        <Settings className="w-3.5 h-3.5" />
                        其他参数
                      </button>
                      <button className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-colors text-left w-full">
                        <EyeOff className="w-3.5 h-3.5" />
                        跳过操作
                      </button>
                      
                      <div className="h-px bg-slate-200 dark:bg-slate-700/50 my-1 mx-2"></div>
                      
                      <button className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors text-left w-full">
                        <Trash className="w-3.5 h-3.5" />
                        删除
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              step.status === 'completed' ? 'bg-emerald-500' : 
              step.status === 'failed' ? 'bg-red-500' :
              step.status === 'running' ? 'bg-blue-500 relative overflow-hidden' : 'bg-slate-300 dark:bg-slate-700'
            }`}
            style={{ width: `${step.status === 'completed' ? 100 : progress}%` }}
          >
            {isRunning && (
              <div className="absolute inset-0 bg-white/20 animate-[shimmer_1s_infinite] border-t-transparent border-l-transparent border-r-transparent" 
                   style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)' }}></div>
            )}
          </div>
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-[10px] text-slate-500 font-mono">
              {step.status === 'completed' ? '已完成' : 
               step.status === 'running' ? `处理中... ${progress}%` : 
               '等待中'}
          </span>
          {step.status === 'completed' && <span className="text-[10px] text-emerald-600 dark:text-emerald-500 font-mono">15ms</span>}
        </div>
      </div>

      {/* Expanded Content Section */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 animate-in fade-in slide-in-from-top-1 duration-200 cursor-default" onClick={(e) => e.stopPropagation()}>
          <div className="border-t border-slate-200 dark:border-slate-800 my-3"></div>
          
          <div className="space-y-4">
            
            {/* New: Node Summary Input */}
            <div>
               <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-400 mb-2 uppercase tracking-wider">
                  <AlignLeft className="w-3.5 h-3.5" />
                  节点概要
               </label>
               <input 
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#0B0E14] border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-sm text-slate-800 dark:text-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder-slate-400 dark:placeholder-slate-600 font-medium"
                  placeholder="输入节点的简短描述..."
               />
            </div>

            {/* Existing: Content Textarea */}
            <div>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-400 mb-2 uppercase tracking-wider">
                    <FileCode className="w-3.5 h-3.5" />
                    节点内容
                </label>
                <textarea 
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full h-48 bg-slate-50 dark:bg-[#0B0E14] border border-slate-300 dark:border-slate-700 rounded-lg p-3 text-sm font-mono text-slate-800 dark:text-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none placeholder-slate-400 dark:placeholder-slate-600 custom-scrollbar"
                    placeholder="输入脚本、提示词或配置内容..."
                />
            </div>

            <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/30 rounded px-3 py-2">
                <p className="text-[10px] text-blue-800 dark:text-blue-200 flex items-center gap-1.5 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400"></span>
                    编辑此步骤需要从此处开始部分重新运行。
                </p>
                <div className="flex gap-2">
                    <button 
                        onClick={handleCancel}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-colors"
                    >
                        取消
                    </button>
                    <button 
                        onClick={handleSave}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded shadow-md shadow-blue-500/20 dark:shadow-blue-900/20 transition-colors"
                    >
                        <Save className="w-3 h-3" />
                        保存更改
                    </button>
                </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};