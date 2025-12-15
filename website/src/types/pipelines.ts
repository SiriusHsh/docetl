import { PipelineStateSnapshot } from "@/contexts/PipelineContext";

export interface PipelineMetadata {
  id: string;
  name: string;
  namespace: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  last_run_status?: string | null;
  last_run_at?: string | null;
}

export interface PipelineRecord extends PipelineMetadata {
  state: PipelineStateSnapshot;
}
