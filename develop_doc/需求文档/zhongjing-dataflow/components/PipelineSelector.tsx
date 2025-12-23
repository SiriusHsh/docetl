import React, { useState, useRef, useEffect } from 'react';
import { Pipeline } from '../types';
import { CheckCircle2, CircleDashed, Plus, MoreVertical, Copy, Trash, Pencil, X, Check } from 'lucide-react';

interface PipelineSelectorProps {
  pipelines: Pipeline[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}

export const PipelineSelector: React.FC<PipelineSelectorProps> = ({ 
  pipelines, 
  selectedId, 
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
  onRename
}) => {
  // Menu State
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Renaming State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const startRenaming = (e: React.MouseEvent, pipeline: Pipeline) => {
    e.stopPropagation();
    setActiveMenuId(null);
    setEditingId(pipeline.id);
    setEditName(pipeline.name);
  };

  const saveRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const cancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDuplicate = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onDuplicate(id);
    setActiveMenuId(null);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Confirm delete could go here, for now direct delete
    onDelete(id);
    setActiveMenuId(null);
  };

  return (
    <div className="h-full bg-white dark:bg-[#151921] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col transition-colors duration-300">
       <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
            {/* Updated Header Style */}
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider">
            活跃流水线
            </h2>
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 px-2 py-0.5 rounded-full">{pipelines.length}</span>
        </div>
        
        {/* Create Button */}
        <button 
            onClick={onCreate}
            className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
            title="新建流水线"
        >
            <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar flex-1 pb-4">
        {pipelines.map((p) => {
          const isSelected = selectedId === p.id;
          const isMenuOpen = activeMenuId === p.id;
          const isEditing = editingId === p.id;

          return (
            <div
              key={p.id}
              onClick={() => !isEditing && onSelect(p.id)}
              className={`relative group cursor-pointer p-3 rounded-md border transition-all duration-200 ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-500/50 shadow-sm dark:shadow-[0_0_15px_-3px_rgba(59,130,246,0.15)]'
                  : 'bg-white dark:bg-[#0B0E14] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-900'
              }`}
            >
              <div className="flex items-start justify-between mb-1 min-h-[24px]">
                {/* Name / Edit Input */}
                {isEditing ? (
                    <div className="flex items-center gap-1 flex-1 mr-2" onClick={e => e.stopPropagation()}>
                        <input 
                            type="text" 
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') saveRename();
                                if (e.key === 'Escape') setEditingId(null);
                            }}
                            autoFocus
                            className="flex-1 bg-white dark:bg-slate-950 border border-blue-500 rounded px-2 py-0.5 text-sm text-slate-900 dark:text-slate-200 focus:outline-none"
                        />
                        <button onClick={saveRename} className="p-1 hover:text-emerald-500 dark:hover:text-emerald-400 text-slate-400"><Check className="w-3 h-3" /></button>
                        <button onClick={cancelRename} className="p-1 hover:text-red-500 dark:hover:text-red-400 text-slate-400"><X className="w-3 h-3" /></button>
                    </div>
                ) : (
                    <span className={`text-sm font-bold leading-tight truncate flex-1 pr-2 ${isSelected ? 'text-blue-800 dark:text-blue-200' : 'text-slate-800 dark:text-slate-200'}`}>
                    {p.name}
                    </span>
                )}
                
                {/* Status & Actions Container - Fixed Overlap */}
                {!isEditing && (
                    <div className="flex items-center gap-0.5 shrink-0 ml-1">
                        {/* Status Icon */}
                         <div className="flex items-center justify-center w-6 h-6" title={`Status: ${p.status}`}>
                            {p.status === 'active' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                                <CircleDashed className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
                            )}
                        </div>

                        {/* Context Menu Trigger */}
                        <div className="relative">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(isMenuOpen ? null : p.id);
                                }}
                                className={`flex items-center justify-center w-6 h-6 rounded-md transition-all duration-200 ${
                                    isMenuOpen 
                                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white opacity-100' 
                                    : 'text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200'
                                }`}
                            >
                                <MoreVertical className="w-4 h-4" />
                            </button>

                            {/* Dropdown Menu */}
                            {isMenuOpen && (
                                <div 
                                    ref={menuRef}
                                    className="absolute right-0 top-7 w-36 bg-white dark:bg-[#1e2330] border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 flex flex-col py-1 animate-in fade-in zoom-in-95 duration-100 origin-top-right"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button 
                                        onClick={(e) => startRenaming(e, p)}
                                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-colors text-left"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                        重命名
                                    </button>
                                    <button 
                                        onClick={(e) => handleDuplicate(e, p.id)}
                                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white transition-colors text-left"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                        复制
                                    </button>
                                    <div className="h-px bg-slate-200 dark:bg-slate-700/50 my-1 mx-2"></div>
                                    <button 
                                        onClick={(e) => handleDelete(e, p.id)}
                                        className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-300 transition-colors text-left"
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

              {!isEditing && <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-2 mr-6 leading-relaxed">{p.description}</p>}
              
              {!isEditing && p.lastRun && (
                <div className="text-[10px] text-slate-500 dark:text-slate-500 flex justify-end">
                   上次运行: {p.lastRun}
                </div>
              )}
            </div>
          );
        })}

        {pipelines.length === 0 && (
            <div className="text-center py-8 text-slate-500 dark:text-slate-600 text-xs italic">
                没有活跃的流水线。<br/> 点击 '+' 创建一个。
            </div>
        )}
      </div>
    </div>
  );
};