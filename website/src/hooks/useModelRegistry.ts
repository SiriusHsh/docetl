import { useEffect, useMemo, useState } from "react";

import { getBackendUrl } from "@/lib/api-config";
import { backendFetch } from "@/lib/backendFetch";
import { ModelRegistryEntry } from "@/lib/model-registry";
import { readNamespace } from "@/lib/namespace";

type BackendModelRecord = {
  id: string;
  name: string;
  model_id: string;
  protocol: ModelRegistryEntry["protocol"];
  base_url: string;
  api_key: string;
  tags: string[];
  description: string;
  status: ModelRegistryEntry["status"];
  params?: {
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  } | null;
  created_at: number;
  updated_at: number;
};

export const useModelRegistry = (namespaceOverride?: string | null) => {
  const namespace = useMemo(
    () => namespaceOverride ?? readNamespace() ?? "default",
    [namespaceOverride]
  );
  const [models, setModels] = useState<ModelRegistryEntry[]>([]);
  const backendUrl = useMemo(() => getBackendUrl(), []);

  useEffect(() => {
    const loadModels = async () => {
      try {
        const response = await backendFetch(`${backendUrl}/models`);
        if (!response.ok) {
          setModels([]);
          return;
        }
        const data = (await response.json()) as BackendModelRecord[];
        const mapped = data.map((item) => ({
          id: item.id,
          name: item.name,
          modelId: item.model_id,
          protocol: item.protocol,
          baseUrl: item.base_url,
          apiKey: item.api_key,
          tags: item.tags || [],
          description: item.description || "",
          status: item.status || "active",
          params: item.params
            ? {
                temperature: item.params.temperature,
                top_p: item.params.top_p,
                max_tokens: item.params.max_tokens,
              }
            : undefined,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        })) as ModelRegistryEntry[];
        setModels(mapped);
      } catch {
        setModels([]);
      }
    };
    void loadModels();
  }, [backendUrl, namespace]);

  const modelOptions = useMemo(
    () =>
      models
        .filter((model) => model.status === "active")
        .map((model) => ({
          value: model.modelId,
          label: model.name,
          description: `${model.protocol} · ${model.baseUrl}`,
          tags: model.tags,
        })),
    [models]
  );

  return { namespace, models, modelOptions };
};
