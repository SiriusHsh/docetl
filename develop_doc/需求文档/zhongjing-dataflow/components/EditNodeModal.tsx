import React, { useState, useEffect } from 'react';
import { X, Save, FileCode } from 'lucide-react';
import { OperationStep } from '../types';

interface EditNodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  step: OperationStep | null;
  onSave: (id: string, newDescription: string) => void;
}

export const EditNodeModal: React.FC<EditNodeModalProps> = ({ isOpen, onClose, step, onSave }) => {
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (step) {
      setDescription(step.description || '');
    }
  }, [step]);

  if (!isOpen || !step) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#151921] border border-slate-700 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg">
              <FileCode className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">编辑节点配置</h2>
              <p className="text-xs text-slate-400 font-mono uppercase">{step.type} • {step.name}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 overflow-y-auto">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            操作描述 / 提示词
          </label>
          <textarea 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full h-64 bg-[#0B0E14] border border-slate-700 rounded-lg p-4 text-sm font-mono text-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none"
            placeholder="输入此操作的详细说明..."
          />
          <div className="mt-4 p-4 bg-blue-900/10 border border-blue-900/30 rounded-lg">
            <h4 className="text-xs font-semibold text-blue-200 mb-1">配置提示</h4>
            <p className="text-xs text-slate-400">
              对此节点的更改将需要从该步骤开始部分重新运行流水线。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700 bg-[#0B0E14]/50 rounded-b-xl">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            取消
          </button>
          <button 
            onClick={() => {
              onSave(step.id, description);
              onClose();
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-900/20 transition-all"
          >
            <Save className="w-4 h-4" />
            保存更改
          </button>
        </div>
      </div>
    </div>
  );
};