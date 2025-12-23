export enum OperationType {
  MAP = 'map',
  REDUCE = 'reduce',
  FILTER = 'filter',
  SPLIT = 'split',
  GATHER = 'gather',
  GENERATE = 'generate'
}

export interface DataSource {
  id: string;
  name: string;
  type: 'json' | 'csv' | 'sql' | 'text';
  recordCount: number;
  size: string;
}

export interface OperationStep {
  id: string;
  type: OperationType;
  name: string;
  description?: string; // Short summary
  content?: string;     // The actual script/code/prompt
  status: 'idle' | 'running' | 'completed' | 'failed';
  progress?: number;
  config?: Record<string, any>;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'inactive' | 'draft';
  dataSources: DataSource[];
  steps: OperationStep[];
  lastRun?: string;
}

export interface ConsoleLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
}