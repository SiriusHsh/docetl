import * as localStorageKeys from "@/app/localStorageKeys";

export type ModelProtocol = "openai" | "openai-compatible" | "azure";

export type ModelStatus = "active" | "inactive";

export type ModelParams = {
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
};

export type ModelRegistryEntry = {
  id: string;
  name: string;
  modelId: string;
  protocol: ModelProtocol;
  baseUrl: string;
  apiKey: string;
  tags: string[];
  description: string;
  status: ModelStatus;
  params?: ModelParams;
  createdAt: number;
  updatedAt: number;
};

type ModelRegistryState = {
  version: number;
  namespaces: Record<string, ModelRegistryEntry[]>;
};

export const MODEL_REGISTRY_CHANGE_EVENT = "docetl:model-registry-change";

const EMPTY_STATE: ModelRegistryState = {
  version: 1,
  namespaces: {},
};

const readState = (): ModelRegistryState => {
  if (typeof window === "undefined") {
    return EMPTY_STATE;
  }
  const raw = window.localStorage.getItem(localStorageKeys.MODEL_REGISTRY_KEY);
  if (!raw) {
    return EMPTY_STATE;
  }
  try {
    const parsed = JSON.parse(raw) as ModelRegistryState;
    if (!parsed || typeof parsed !== "object") {
      return EMPTY_STATE;
    }
    if (!parsed.namespaces || typeof parsed.namespaces !== "object") {
      return EMPTY_STATE;
    }
    return {
      version: parsed.version ?? 1,
      namespaces: parsed.namespaces,
    };
  } catch {
    return EMPTY_STATE;
  }
};

const writeState = (state: ModelRegistryState) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    localStorageKeys.MODEL_REGISTRY_KEY,
    JSON.stringify(state)
  );
  window.dispatchEvent(
    new CustomEvent(MODEL_REGISTRY_CHANGE_EVENT, { detail: state })
  );
};

const normalizeModel = (model: ModelRegistryEntry): ModelRegistryEntry => ({
  ...model,
  status: model.status ?? "active",
  protocol: model.protocol ?? "openai",
  tags: Array.isArray(model.tags) ? model.tags : [],
  description: model.description ?? "",
  baseUrl: model.baseUrl ?? "",
  apiKey: model.apiKey ?? "",
  modelId: model.modelId ?? "",
  name: model.name ?? "",
  createdAt: model.createdAt ?? model.updatedAt ?? Date.now(),
  updatedAt: model.updatedAt ?? model.createdAt ?? Date.now(),
});

const sortModels = (models: ModelRegistryEntry[]) =>
  [...models].map(normalizeModel).sort((a, b) => b.updatedAt - a.updatedAt);

export const generateModelId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `model_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const getModelsForNamespace = (
  namespace: string | null
): ModelRegistryEntry[] => {
  if (!namespace) return [];
  const state = readState();
  return sortModels(state.namespaces[namespace] || []);
};

export const getModelById = (
  namespace: string | null,
  id: string
): ModelRegistryEntry | null => {
  if (!namespace) return null;
  const models = getModelsForNamespace(namespace);
  return models.find((model) => model.id === id) ?? null;
};

export const upsertModel = (
  namespace: string,
  entry: ModelRegistryEntry
): ModelRegistryEntry[] => {
  const state = readState();
  const current = state.namespaces[namespace] || [];
  const next = current.some((model) => model.id === entry.id)
    ? current.map((model) => (model.id === entry.id ? entry : model))
    : [...current, entry];
  const nextState: ModelRegistryState = {
    ...state,
    namespaces: {
      ...state.namespaces,
      [namespace]: next,
    },
  };
  writeState(nextState);
  return sortModels(next);
};

export const deleteModel = (namespace: string, id: string): ModelRegistryEntry[] => {
  const state = readState();
  const current = state.namespaces[namespace] || [];
  const next = current.filter((model) => model.id !== id);
  const nextState: ModelRegistryState = {
    ...state,
    namespaces: {
      ...state.namespaces,
      [namespace]: next,
    },
  };
  writeState(nextState);
  return sortModels(next);
};

export const subscribeToModelRegistryChanges = (
  handler: (state: ModelRegistryState) => void
): (() => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const handleCustom = (event: Event) => {
    const customEvent = event as CustomEvent<ModelRegistryState>;
    handler(customEvent.detail ?? readState());
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === localStorageKeys.MODEL_REGISTRY_KEY) {
      handler(readState());
    }
  };
  window.addEventListener(MODEL_REGISTRY_CHANGE_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(MODEL_REGISTRY_CHANGE_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
};
