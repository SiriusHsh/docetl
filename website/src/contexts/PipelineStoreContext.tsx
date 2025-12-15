import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as localStorageKeys from "@/app/localStorageKeys";
import {
  buildPipelineSnapshot,
  createDefaultPipelineState,
  usePipelineContext,
} from "@/contexts/PipelineContext";
import { useToast } from "@/hooks/use-toast";
import {
  createPipelineApi,
  deletePipelineApi,
  duplicatePipelineApi,
  fetchPipeline,
  fetchPipelines,
  updatePipelineApi,
} from "@/lib/pipelineStore";
import { PipelineMetadata, PipelineRecord } from "@/types/pipelines";

interface PipelineStoreContextValue {
  pipelines: PipelineMetadata[];
  activePipelineId: string | null;
  loading: boolean;
  saving: boolean;
  refreshPipelines: () => Promise<void>;
  saveActivePipeline: () => Promise<PipelineRecord | null>;
  switchPipeline: (pipelineId: string) => Promise<void>;
  createPipeline: (name?: string) => Promise<void>;
  duplicatePipeline: (pipelineId: string, name?: string) => Promise<void>;
  renamePipeline: (pipelineId: string, name: string) => Promise<void>;
  deletePipeline: (pipelineId: string) => Promise<void>;
}

const PipelineStoreContext = createContext<PipelineStoreContextValue | null>(
  null
);

const getActivePipelineStorageKey = (namespace: string) =>
  `${localStorageKeys.ACTIVE_PIPELINE_ID_KEY}:${namespace}`;

export const PipelineStoreProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const {
    namespace,
    pipelineName,
    loadPipelineSnapshot,
    getSerializableState,
    saveProgress,
    unsavedChanges,
  } = usePipelineContext();
  const { toast } = useToast();

  const [pipelines, setPipelines] = useState<PipelineMetadata[]>([]);
  const [pipelineCache, setPipelineCache] = useState<
    Record<string, PipelineRecord>
  >({});
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const pipelineCacheRef = React.useRef(pipelineCache);
  const activePipelineIdRef = React.useRef<string | null>(null);
  const pipelinesRef = React.useRef<PipelineMetadata[]>([]);
  const initializedNamespaceRef = React.useRef<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeStorageKey = useMemo(
    () => (namespace ? getActivePipelineStorageKey(namespace) : null),
    [namespace]
  );

  useEffect(() => {
    pipelineCacheRef.current = pipelineCache;
  }, [pipelineCache]);

  useEffect(() => {
    activePipelineIdRef.current = activePipelineId;
  }, [activePipelineId]);

  useEffect(() => {
    pipelinesRef.current = pipelines;
  }, [pipelines]);

  const generateName = useCallback(
    (base: string) => {
      const existing = new Set(
        pipelines.map((pipeline) => pipeline.name.toLowerCase())
      );
      if (!existing.has(base.toLowerCase())) {
        return base;
      }

      let counter = 2;
      let candidate = `${base} ${counter}`;
      while (existing.has(candidate.toLowerCase())) {
        counter += 1;
        candidate = `${base} ${counter}`;
      }
      return candidate;
    },
    [pipelines]
  );

  const persistActivePipelineId = useCallback(
    (id: string | null) => {
      if (!activeStorageKey) return;
      if (id) {
        localStorage.setItem(activeStorageKey, id);
      } else {
        localStorage.removeItem(activeStorageKey);
      }
    },
    [activeStorageKey]
  );

  const applyPipelineRecord = useCallback(
    (record: PipelineRecord) => {
      loadPipelineSnapshot(record.state, { markSaved: true });
      setActivePipelineId(record.id);
      persistActivePipelineId(record.id);
      setPipelineCache((prev) => ({ ...prev, [record.id]: record }));
    },
    [loadPipelineSnapshot, persistActivePipelineId]
  );

  const saveActivePipeline = useCallback(async () => {
    if (!namespace || !activePipelineId) {
      return null;
    }

    const snapshot = getSerializableState();
    setSaving(true);
    try {
      const updated = await updatePipelineApi({
        namespace,
        pipelineId: activePipelineId,
        name: snapshot.pipelineName,
        state: snapshot,
      });

      setPipelines((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      );
      setPipelineCache((prev) => ({ ...prev, [updated.id]: updated }));
      saveProgress();
      return updated;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save pipeline";
      toast({
        title: "保存失败",
        description: message,
        variant: "destructive",
      });
      return null;
    } finally {
      setSaving(false);
    }
  }, [
    activePipelineId,
    getSerializableState,
    namespace,
    saveProgress,
    toast,
  ]);

  const maybeSaveActive = useCallback(async () => {
    if (!unsavedChanges) return;
    await saveActivePipeline();
  }, [saveActivePipeline, unsavedChanges]);

  const switchPipeline = useCallback(
    async (pipelineId: string) => {
      if (!namespace || pipelineId === activePipelineId) return;

      await maybeSaveActive();

      const cached = pipelineCache[pipelineId];
      try {
        if (cached) {
          applyPipelineRecord(cached);
          return;
        }

        setLoading(true);
        const record = await fetchPipeline(namespace, pipelineId);
        applyPipelineRecord(record);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "无法加载所选的 pipeline";
        toast({
          title: "加载失败",
          description: message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [
      activePipelineId,
      applyPipelineRecord,
      maybeSaveActive,
      namespace,
      pipelineCache,
      toast,
    ]
  );

  const bootstrapPipeline = useCallback(async () => {
    if (!namespace) return;

    const seed = getSerializableState();
    const snapshot = {
      ...seed,
      namespace,
      pipelineName: pipelineName || seed.pipelineName,
    };
    const nextName = generateName(snapshot.pipelineName || "Untitled Analysis");
    const stateWithName = { ...snapshot, pipelineName: nextName };

    const created = await createPipelineApi({
      namespace,
      name: nextName,
      state: stateWithName,
    });
    setPipelines([created]);
    applyPipelineRecord(created);
  }, [
    applyPipelineRecord,
    generateName,
    getSerializableState,
    namespace,
    pipelineName,
  ]);

  const refreshPipelines = useCallback(async () => {
    if (!namespace) return;

    setLoading(true);
    try {
      const list = await fetchPipelines(namespace);
      setPipelines(list);

      if (list.length === 0) {
        await bootstrapPipeline();
        return;
      }

      const storedActive =
        activeStorageKey && localStorage.getItem(activeStorageKey);
      const nextActive =
        (storedActive && list.find((p) => p.id === storedActive)?.id) ||
        list[0].id;

      const shouldLoadPipeline =
        nextActive &&
        (nextActive !== activePipelineIdRef.current ||
          !pipelineCacheRef.current[nextActive]);

      if (shouldLoadPipeline) {
        await switchPipeline(nextActive);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "无法获取 pipeline 列表";
      toast({
        title: "加载失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [
    activeStorageKey,
    bootstrapPipeline,
    namespace,
    switchPipeline,
    toast,
  ]);

  const createPipeline = useCallback(
    async (name?: string) => {
      if (!namespace) {
        toast({
          title: "缺少命名空间",
          description: "请先设置命名空间再创建 pipeline。",
          variant: "destructive",
        });
        return;
      }

      await maybeSaveActive();

      const nextName = generateName(name || "New Pipeline");
      const templateState = createDefaultPipelineState(namespace, nextName);
      const snapshot = buildPipelineSnapshot(templateState);

      try {
        const created = await createPipelineApi({
          namespace,
          name: nextName,
          state: { ...snapshot, pipelineName: nextName },
        });
        setPipelines((prev) => [created, ...prev]);
        applyPipelineRecord(created);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "无法创建 pipeline";
        toast({
          title: "创建失败",
          description: message,
          variant: "destructive",
        });
      }
    },
    [applyPipelineRecord, generateName, maybeSaveActive, namespace, toast]
  );

  const duplicatePipeline = useCallback(
    async (pipelineId: string, name?: string) => {
      if (!namespace) return;
      if (pipelineId === activePipelineId) {
        await maybeSaveActive();
      }

      try {
        const baseName =
          name ||
          pipelines.find((p) => p.id === pipelineId)?.name ||
          "Pipeline Copy";
        const nextName = generateName(baseName);

        const duplicated = await duplicatePipelineApi({
          namespace,
          pipelineId,
          name: nextName,
        });
        setPipelines((prev) => [duplicated, ...prev]);
        setPipelineCache((prev) => ({ ...prev, [duplicated.id]: duplicated }));
        await switchPipeline(duplicated.id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "无法复制 pipeline";
        toast({
          title: "复制失败",
          description: message,
          variant: "destructive",
        });
      }
    },
    [
      activePipelineId,
      generateName,
      maybeSaveActive,
      namespace,
      pipelines,
      switchPipeline,
      toast,
    ]
  );

  const renamePipeline = useCallback(
    async (pipelineId: string, name: string) => {
      if (!namespace) return;

      const isActive = pipelineId === activePipelineId;
      const meta = pipelines.find((p) => p.id === pipelineId);
      const state = isActive
        ? { ...getSerializableState(), pipelineName: name }
        : undefined;

      try {
        const updated = await updatePipelineApi({
          namespace,
          pipelineId,
          name,
          state,
        });
        setPipelines((prev) =>
          prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
        );
        setPipelineCache((prev) => ({ ...prev, [updated.id]: updated }));

        if (isActive) {
          applyPipelineRecord(updated);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "无法重命名 pipeline";
        toast({
          title: "重命名失败",
          description: message,
          variant: "destructive",
        });
      }
    },
    [
      activePipelineId,
      applyPipelineRecord,
      getSerializableState,
      namespace,
      pipelines,
      toast,
    ]
  );

  const deletePipeline = useCallback(
    async (pipelineId: string) => {
      if (!namespace) return;

      try {
        await deletePipelineApi(namespace, pipelineId);
        setPipelines((prev) => prev.filter((p) => p.id !== pipelineId));
        setPipelineCache((prev) => {
          const next = { ...prev };
          delete next[pipelineId];
          return next;
        });

        if (activePipelineId === pipelineId) {
          const remaining = pipelines.filter((p) => p.id !== pipelineId);
          if (remaining.length > 0) {
            await switchPipeline(remaining[0].id);
          } else {
            await bootstrapPipeline();
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "无法删除 pipeline";
        toast({
          title: "删除失败",
          description: message,
          variant: "destructive",
        });
      }
    },
    [
      activePipelineId,
      bootstrapPipeline,
      namespace,
      pipelines,
      switchPipeline,
      toast,
    ]
  );

  useEffect(() => {
    if (!namespace) {
      setActivePipelineId(null);
      setPipelineCache({});
      setPipelines([]);
      return;
    }

    if (initializedNamespaceRef.current === namespace) {
      return;
    }
    initializedNamespaceRef.current = namespace;

    const stored =
      activeStorageKey && localStorage.getItem(activeStorageKey);
    if (stored) {
      setActivePipelineId(stored);
    } else {
      setActivePipelineId(null);
    }
    setPipelineCache({});
    setPipelines([]);
    // 仅在 namespace 变化时刷新，避免依赖变动导致的重复刷新
    void refreshPipelines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStorageKey, namespace]);

  const value: PipelineStoreContextValue = {
    pipelines,
    activePipelineId,
    loading,
    saving,
    refreshPipelines,
    saveActivePipeline,
    switchPipeline,
    createPipeline,
    duplicatePipeline,
    renamePipeline,
    deletePipeline,
  };

  return (
    <PipelineStoreContext.Provider value={value}>
      {children}
    </PipelineStoreContext.Provider>
  );
};

export const usePipelineStore = () => {
  const context = useContext(PipelineStoreContext);
  if (!context) {
    throw new Error(
      "usePipelineStore must be used within a PipelineStoreProvider"
    );
  }
  return context;
};
