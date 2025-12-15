import { PipelineStateSnapshot } from "@/contexts/PipelineContext";
import { PipelineMetadata, PipelineRecord } from "@/types/pipelines";
import { getBackendUrl } from "./api-config";

const backendUrl = getBackendUrl();

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${backendUrl}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request to ${path} failed with ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(text) as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export async function fetchPipelines(
  namespace: string
): Promise<PipelineMetadata[]> {
  return request<PipelineMetadata[]>(`/pipelines?namespace=${encodeURIComponent(namespace)}`);
}

export async function fetchPipeline(
  namespace: string,
  pipelineId: string
): Promise<PipelineRecord> {
  return request<PipelineRecord>(
    `/pipelines/${pipelineId}?namespace=${encodeURIComponent(namespace)}`
  );
}

export async function createPipelineApi(params: {
  namespace: string;
  name: string;
  description?: string | null;
  state?: PipelineStateSnapshot;
}): Promise<PipelineRecord> {
  return request<PipelineRecord>("/pipelines", {
    method: "POST",
    body: JSON.stringify({
      namespace: params.namespace,
      name: params.name,
      description: params.description,
      state: params.state ?? {},
    }),
  });
}

export async function updatePipelineApi(params: {
  namespace: string;
  pipelineId: string;
  name?: string;
  description?: string | null;
  state?: PipelineStateSnapshot;
  expectedUpdatedAt?: string;
}): Promise<PipelineRecord> {
  const payload: Record<string, unknown> = {
    namespace: params.namespace,
    name: params.name,
    description: params.description,
    state: params.state,
  };

  if (params.expectedUpdatedAt) {
    payload.expected_updated_at = params.expectedUpdatedAt;
  }

  return request<PipelineRecord>(`/pipelines/${params.pipelineId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deletePipelineApi(
  namespace: string,
  pipelineId: string
): Promise<void> {
  await request<void>(
    `/pipelines/${pipelineId}?namespace=${encodeURIComponent(namespace)}`,
    { method: "DELETE" }
  );
}

export async function duplicatePipelineApi(params: {
  namespace: string;
  pipelineId: string;
  name?: string;
}): Promise<PipelineRecord> {
  return request<PipelineRecord>(`/pipelines/${params.pipelineId}/duplicate`, {
    method: "POST",
    body: JSON.stringify({
      namespace: params.namespace,
      name: params.name,
    }),
  });
}
