import { useEffect, useMemo, useState } from "react";

import {
  ModelRegistryEntry,
  getModelsForNamespace,
  subscribeToModelRegistryChanges,
} from "@/lib/model-registry";
import { readNamespace, subscribeToNamespaceChanges } from "@/lib/namespace";

export const useModelRegistry = (namespaceOverride?: string | null) => {
  const [namespace, setNamespace] = useState<string | null>(
    namespaceOverride ?? readNamespace()
  );
  const [models, setModels] = useState<ModelRegistryEntry[]>(() =>
    getModelsForNamespace(namespaceOverride ?? readNamespace())
  );

  useEffect(() => {
    if (namespaceOverride !== undefined) {
      setNamespace(namespaceOverride ?? null);
    }
  }, [namespaceOverride]);

  useEffect(() => {
    if (namespaceOverride !== undefined) return;
    setNamespace(readNamespace());
    return subscribeToNamespaceChanges((next) => {
      setNamespace(next);
    });
  }, [namespaceOverride]);

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
