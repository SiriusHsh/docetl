import { useEffect, useMemo, useState } from "react";

import {
  ModelRegistryEntry,
  getModelsForNamespace,
  subscribeToModelRegistryChanges,
} from "@/lib/model-registry";
import { readNamespace } from "@/lib/namespace";

export const useModelRegistry = (namespaceOverride?: string | null) => {
  const namespace = useMemo(
    () => namespaceOverride ?? readNamespace() ?? "default",
    [namespaceOverride]
  );
  const [models, setModels] = useState<ModelRegistryEntry[]>(() =>
    getModelsForNamespace(namespace)
  );

  useEffect(() => {
    setModels(getModelsForNamespace(namespace));
  }, [namespace]);

  useEffect(() => {
    const unsubscribe = subscribeToModelRegistryChanges(() => {
      setModels(getModelsForNamespace(namespace));
    });
    return unsubscribe;
  }, [namespace]);

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
