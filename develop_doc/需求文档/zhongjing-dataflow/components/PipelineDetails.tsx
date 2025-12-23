import React from 'react';
import { Pipeline, DataSource } from '../types';
import { Database, FileJson, Table, FileText } from 'lucide-react';

interface PipelineDetailsProps {
  pipeline: Pipeline;
  onSelectDataSource: (ds: DataSource) => void;
  selectedDataSourceId: string | null;
}

export const PipelineDetails: React.FC<PipelineDetailsProps> = ({ 
  pipeline, 
  onSelectDataSource,
  selectedDataSourceId
}) => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'json': return <FileJson className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />;
      case 'csv': return <Table className="w-4 h-4 text-green-600 dark:text-green-500" />;
      case 'sql': return <Database className="w-4 h-4 text-blue-600 dark:text-blue-500" />;
      default: return <FileText className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="h-full bg-white dark:bg-[#151921] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col transition-colors duration-300">
      {/* Updated Header Style */}
      <h2 className="text-sm font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wider mb-4">
        输入数据源
      </h2>
      
      <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar flex-1">
        {pipeline.dataSources.map((ds) => {
          const isSelected = selectedDataSourceId === ds.id;
          return (
            <div 
              key={ds.id} 
              onClick={() => onSelectDataSource(ds)}
              className={`flex items-center p-3 border rounded-md group transition-all cursor-pointer ${
                isSelected 
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-500/50 shadow-sm dark:shadow-[0_0_10px_-2px_rgba(59,130,246,0.15)]' 
                  : 'bg-white dark:bg-[#0B0E14] border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-[#1a1f2b]'
              }`}
            >
              <div className={`p-2 rounded border mr-3 transition-colors ${
                isSelected ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800' : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}>
                {getIcon(ds.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-bold truncate ${isSelected ? 'text-blue-800 dark:text-blue-200' : 'text-slate-800 dark:text-slate-200'}`}>
                    {ds.name}
                  </span>
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">{ds.type.toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-500">
                  <span>{ds.recordCount.toLocaleString()} 条记录</span>
                  <span className="w-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full"></span>
                  <span>{ds.size}</span>
                </div>
              </div>
            </div>
          );
        })}
        
        {pipeline.dataSources.length === 0 && (
          <div className="text-center py-8 text-slate-500 dark:text-slate-600 italic text-sm border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
            未配置数据源
          </div>
        )}
      </div>
    </div>
  );
};