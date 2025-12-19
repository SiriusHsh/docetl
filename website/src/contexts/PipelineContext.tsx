import React, {
  useState,
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
} from "react";
import { Operation, File, OutputType, Bookmark, APIKey } from "@/app/types";
import {
  mockFiles,
  initialOperations,
  mockSampleSize,
  mockPipelineName,
} from "@/mocks/mockData";
import * as localStorageKeys from "@/app/localStorageKeys";
import { toast } from "@/hooks/use-toast";
import { backendFetch } from "@/lib/backendFetch";

export interface PipelineState {
  pipelineId: string | null;
  operations: Operation[];
  currentFile: File | null;
  output: OutputType | null;
  terminalOutput: string;
  optimizerProgress: {
    status: string;
    progress: number;
    shouldOptimize: boolean;
    rationale: string;
    validatorPrompt: string;
  } | null;
  isLoadingOutputs: boolean;
  numOpRun: number;
  pipelineName: string;
  sampleSize: number | null;
  files: File[];
  cost: number;
  defaultModel: string;
  optimizerModel: string;
  autoOptimizeCheck: boolean;
  highLevelGoal: string;
  systemPrompt: { datasetDescription: string | null; persona: string | null };
  namespace: string | null;
  apiKeys: APIKey[];
  extraPipelineSettings: Record<string, unknown> | null;
}

export type PipelineStateSnapshot = Omit<PipelineState, "apiKeys">;

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

interface PipelineContextType extends PipelineState {
  setOperations: React.Dispatch<React.SetStateAction<Operation[]>>;
  setCurrentFile: React.Dispatch<React.SetStateAction<File | null>>;
  setOutput: React.Dispatch<React.SetStateAction<OutputType | null>>;
  setTerminalOutput: React.Dispatch<React.SetStateAction<string>>;
  setOptimizerProgress: React.Dispatch<
    React.SetStateAction<{
      status: string;
      progress: number;
      shouldOptimize: boolean;
      rationale: string;
      validatorPrompt: string;
    } | null>
  >;
  setIsLoadingOutputs: React.Dispatch<React.SetStateAction<boolean>>;
  setNumOpRun: React.Dispatch<React.SetStateAction<number>>;
  setPipelineName: React.Dispatch<React.SetStateAction<string>>;
  setSampleSize: React.Dispatch<React.SetStateAction<number | null>>;
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
  setCost: React.Dispatch<React.SetStateAction<number>>;
  setDefaultModel: React.Dispatch<React.SetStateAction<string>>;
  setOptimizerModel: React.Dispatch<React.SetStateAction<string>>;
  saveProgress: () => void;
  unsavedChanges: boolean;
  clearPipelineState: () => void;
  serializeState: () => Promise<string>;
  setAutoOptimizeCheck: React.Dispatch<React.SetStateAction<boolean>>;
  setHighLevelGoal: React.Dispatch<React.SetStateAction<string>>;
  setSystemPrompt: React.Dispatch<
    React.SetStateAction<{
      datasetDescription: string | null;
      persona: string | null;
    }>
  >;
  setNamespace: React.Dispatch<React.SetStateAction<string | null>>;
  setApiKeys: React.Dispatch<React.SetStateAction<APIKey[]>>;
  setExtraPipelineSettings: React.Dispatch<
    React.SetStateAction<Record<string, unknown> | null>
  >;
  getSerializableState: () => PipelineStateSnapshot;
  loadPipelineSnapshot: (
    snapshot: Partial<PipelineStateSnapshot>,
    options?: { markSaved?: boolean }
  ) => void;
}

const PipelineContext = createContext<PipelineContextType | undefined>(
  undefined
);

const loadFromLocalStorage = <T,>(key: string, defaultValue: T): T => {
  if (typeof window !== "undefined") {
    const storedValue = localStorage.getItem(key);
    return storedValue ? JSON.parse(storedValue) : defaultValue;
  }
  return defaultValue;
};

export const createDefaultPipelineState = (
  namespace: string | null,
  pipelineName: string = mockPipelineName
): PipelineState => ({
  pipelineId: null,
  operations: initialOperations,
  currentFile: null,
  output: null,
  terminalOutput: "",
  optimizerProgress: null,
  isLoadingOutputs: false,
  numOpRun: 0,
  pipelineName,
  sampleSize: mockSampleSize,
  files: mockFiles,
  cost: 0,
  defaultModel: "gpt-5-nano",
  optimizerModel: "gpt-5-nano",
  autoOptimizeCheck: false,
  highLevelGoal: "",
  systemPrompt: { datasetDescription: null, persona: null },
  namespace,
  apiKeys: [],
  extraPipelineSettings: null,
});

const sanitizeFile = (file: File | null): File | null =>
  file ? { ...file, blob: undefined } : null;

const sanitizeFiles = (files: File[]): File[] =>
  files
    .map((file) => sanitizeFile(file))
    .filter((file): file is File => Boolean(file));

export const buildPipelineSnapshot = (
  state: PipelineState
): PipelineStateSnapshot => ({
  pipelineId: state.pipelineId,
  operations: state.operations,
  currentFile: sanitizeFile(state.currentFile),
  output: state.output,
  terminalOutput: state.terminalOutput,
  optimizerProgress: state.optimizerProgress,
  isLoadingOutputs: state.isLoadingOutputs,
  numOpRun: state.numOpRun,
  pipelineName: state.pipelineName,
  sampleSize: state.sampleSize,
  files: sanitizeFiles(state.files),
  cost: state.cost,
  defaultModel: state.defaultModel,
  optimizerModel: state.optimizerModel,
  autoOptimizeCheck: state.autoOptimizeCheck,
  highLevelGoal: state.highLevelGoal,
  systemPrompt: state.systemPrompt,
  namespace: state.namespace,
  extraPipelineSettings: state.extraPipelineSettings,
});

const serializeState = async (state: PipelineState): Promise<string> => {
  const bookmarks = loadFromLocalStorage(localStorageKeys.BOOKMARKS_KEY, []);

  // Get important output samples
  let outputSample = "";
  let currentOperationName = "";
  let schemaInfo = "";

  if (state.output?.path) {
    try {
      const outputResponse = await backendFetch(
        `/api/readFile?path=${encodeURIComponent(state.output.path)}`
      );
      if (!outputResponse.ok) {
        throw new Error("Failed to fetch output file");
      }

      const outputContent = await outputResponse.text();
      const outputs = JSON.parse(outputContent) || [];

      if (outputs.length > 0) {
        // Get the operation that generated this output
        const operation = state.operations.find(
          (op) => op.id === state.output?.operationId
        );
        currentOperationName = operation?.name || "";
        const importantColumns =
          operation?.output?.schema?.map((item) => item.key) || [];

        // Generate schema information
        if (outputs.length > 0) {
          const firstRow = outputs[0];
          schemaInfo = Object.entries(firstRow)
            .map(([key, value]) => {
              const type = typeof value;
              return `- ${key}: ${type}${
                importantColumns.includes(key)
                  ? " (output of current operation)"
                  : ""
              }`;
            })
            .join("\n");
        }

        // Take up to 10 samples
        const samples = outputs
          .slice(0, 10)
          .map((row: Record<string, unknown>) => {
            const sampleRow: Record<string, unknown> = {};

            // Helper function to safely stringify values
            const safeStringify = (value: unknown): string => {
              if (value === null) return "null";
              if (value === undefined) return "undefined";
              if (typeof value === "object") {
                try {
                  return JSON.stringify(value);
                } catch {
                  return "[Complex Object]";
                }
              }
              return String(value);
            };

            // Prioritize important columns
            importantColumns.forEach((col) => {
              if (col in row) {
                const value = safeStringify(row[col]);
                if (value.length > 10000) {
                  sampleRow[`**${col}**`] =
                    `**${value.slice(0, 10000)}` +
                    `** ... (${value.length - 10000} more characters)`;
                } else {
                  sampleRow[`**${col}**`] = `**${value}**`;
                }
              }
            });

            // Add other columns in addition to important ones
            Object.keys(row).forEach((key) => {
              if (!(key in sampleRow)) {
                // Only add if not already added
                const value = safeStringify(row[key]);
                if (value.length > 10000) {
                  sampleRow[key] =
                    value.slice(0, 10000) +
                    ` ... (${value.length - 10000} more characters)`;
                } else {
                  sampleRow[key] = value;
                }
              }
            });

            return sampleRow;
          });

        outputSample =
          samples.length > 0 ? JSON.stringify(samples, null, 2) : "";
      }
    } catch {
      outputSample = "\nError parsing output samples";
    }
  }

  // Format operations details
  const operationsDetails = state.operations
    .map((op) => {
      return `
- Operation: ${op.name} (${op.type})
  Type: ${op.type}
  Is LLM: ${op.llmType ? "Yes" : "No"}
  Prompt (relevant for llm operations): ${op.prompt || "No prompt"}
  Output Schema (relevant for llm operations): ${JSON.stringify(
    op.output?.schema || []
  )}
  Other arguments: ${JSON.stringify(op.otherKwargs || {}, null, 2)}`;
    })
    .join("\n");

  // Format bookmarks
  const bookmarksDetails = bookmarks
    .map((bookmark: Bookmark) => {
      return `
- Color: ${bookmark.color}
  Notes: ${bookmark.notes
    .map(
      (note) => `
    "${note.note}"${
        note.metadata?.columnId
          ? `
    Column: ${note.metadata.columnId}${
              note.metadata.rowIndex !== undefined
                ? `
    Row: ${note.metadata.rowIndex}`
                : ""
            }`
          : ""
      }${
        note.metadata?.operationName
          ? `
    Operation: ${note.metadata.operationName}`
          : ""
      }`
    )
    .join("\n")}`;
    })
    .join("\n");

  return `Current Pipeline State:
Pipeline Name: "${state.pipelineName}"
High-Level Goal: "${state.highLevelGoal || "unspecified"}"
Input Dataset File: ${
    state.currentFile ? `"${state.currentFile.name}"` : "None"
  }

Pipeline operations:${operationsDetails}

My feedback:${
    bookmarks.length > 0 ? bookmarksDetails : "\nNo feedback added yet"
  }
${
  currentOperationName && outputSample
    ? `
Operation just executed: ${currentOperationName}

Schema Information:
${schemaInfo}

Sample output for current operation (the LLM-generated outputs for this operation are bolded; other keys from other operations or the original input file are included but not bolded):
${outputSample}`
    : ""
}`;
};

export const PipelineProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const buildInitialState = (): PipelineState => {
    const namespace = loadFromLocalStorage(localStorageKeys.NAMESPACE_KEY, null);
    const snapshot = {
      pipelineId: loadFromLocalStorage(localStorageKeys.PIPELINE_ID_KEY, null),
      operations: loadFromLocalStorage(
        localStorageKeys.OPERATIONS_KEY,
        initialOperations
      ),
      currentFile: loadFromLocalStorage(localStorageKeys.CURRENT_FILE_KEY, null),
      output: loadFromLocalStorage(localStorageKeys.OUTPUT_KEY, null),
      terminalOutput: loadFromLocalStorage(
        localStorageKeys.TERMINAL_OUTPUT_KEY,
        ""
      ),
      optimizerProgress: null,
      isLoadingOutputs: loadFromLocalStorage(
        localStorageKeys.IS_LOADING_OUTPUTS_KEY,
        false
      ),
      numOpRun: loadFromLocalStorage(localStorageKeys.NUM_OP_RUN_KEY, 0),
      pipelineName: loadFromLocalStorage(
        localStorageKeys.PIPELINE_NAME_KEY,
        mockPipelineName
      ),
      sampleSize: loadFromLocalStorage(
        localStorageKeys.SAMPLE_SIZE_KEY,
        mockSampleSize
      ),
      files: loadFromLocalStorage(localStorageKeys.FILES_KEY, mockFiles),
      cost: loadFromLocalStorage(localStorageKeys.COST_KEY, 0),
      defaultModel: loadFromLocalStorage(
        localStorageKeys.DEFAULT_MODEL_KEY,
        "gpt-5-nano"
      ),
      optimizerModel: loadFromLocalStorage(
        localStorageKeys.OPTIMIZER_MODEL_KEY,
        "gpt-5-nano"
      ),
      autoOptimizeCheck: loadFromLocalStorage(
        localStorageKeys.AUTO_OPTIMIZE_CHECK_KEY,
        false
      ),
      highLevelGoal: loadFromLocalStorage(
        localStorageKeys.HIGH_LEVEL_GOAL_KEY,
        ""
      ),
      systemPrompt: loadFromLocalStorage(localStorageKeys.SYSTEM_PROMPT_KEY, {
        datasetDescription: null,
        persona: null,
      }),
      namespace,
      apiKeys: [],
      extraPipelineSettings: loadFromLocalStorage(
        localStorageKeys.EXTRA_PIPELINE_SETTINGS_KEY,
        null
      ),
    };

    return { ...createDefaultPipelineState(namespace), ...snapshot };
  };

  const [state, setState] = useState<PipelineState>(buildInitialState);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const persistSnapshotToLocalStorage = useCallback(
    (snapshot: PipelineStateSnapshot) => {
      localStorage.setItem(
        localStorageKeys.PIPELINE_ID_KEY,
        JSON.stringify(snapshot.pipelineId)
      );
      localStorage.setItem(
        localStorageKeys.OPERATIONS_KEY,
        JSON.stringify(snapshot.operations)
      );
      localStorage.setItem(
        localStorageKeys.CURRENT_FILE_KEY,
        JSON.stringify(snapshot.currentFile)
      );
      localStorage.setItem(
        localStorageKeys.OUTPUT_KEY,
        JSON.stringify(snapshot.output)
      );
      localStorage.setItem(
        localStorageKeys.TERMINAL_OUTPUT_KEY,
        JSON.stringify(snapshot.terminalOutput)
      );
      localStorage.setItem(
        localStorageKeys.IS_LOADING_OUTPUTS_KEY,
        JSON.stringify(snapshot.isLoadingOutputs)
      );
      localStorage.setItem(
        localStorageKeys.NUM_OP_RUN_KEY,
        JSON.stringify(snapshot.numOpRun)
      );
      localStorage.setItem(
        localStorageKeys.PIPELINE_NAME_KEY,
        JSON.stringify(snapshot.pipelineName)
      );
      localStorage.setItem(
        localStorageKeys.SAMPLE_SIZE_KEY,
        JSON.stringify(snapshot.sampleSize)
      );
      localStorage.setItem(
        localStorageKeys.FILES_KEY,
        JSON.stringify(snapshot.files)
      );
      localStorage.setItem(
        localStorageKeys.COST_KEY,
        JSON.stringify(snapshot.cost)
      );
      localStorage.setItem(
        localStorageKeys.DEFAULT_MODEL_KEY,
        JSON.stringify(snapshot.defaultModel)
      );
      localStorage.setItem(
        localStorageKeys.OPTIMIZER_MODEL_KEY,
        JSON.stringify(snapshot.optimizerModel)
      );
      localStorage.setItem(
        localStorageKeys.AUTO_OPTIMIZE_CHECK_KEY,
        JSON.stringify(snapshot.autoOptimizeCheck)
      );
      localStorage.setItem(
        localStorageKeys.HIGH_LEVEL_GOAL_KEY,
        JSON.stringify(snapshot.highLevelGoal)
      );
      localStorage.setItem(
        localStorageKeys.SYSTEM_PROMPT_KEY,
        JSON.stringify(snapshot.systemPrompt)
      );
      localStorage.setItem(
        localStorageKeys.NAMESPACE_KEY,
        JSON.stringify(snapshot.namespace)
      );
      localStorage.setItem(
        localStorageKeys.EXTRA_PIPELINE_SETTINGS_KEY,
        JSON.stringify(snapshot.extraPipelineSettings)
      );

      if (snapshot.pipelineId) {
        const cache = loadFromLocalStorage<
          Record<string, PipelineStateSnapshot>
        >(localStorageKeys.PIPELINE_CACHE_KEY, {});
        cache[snapshot.pipelineId] = snapshot;
        localStorage.setItem(
          localStorageKeys.PIPELINE_CACHE_KEY,
          JSON.stringify(cache)
        );
      }
    },
    []
  );

  const saveProgress = useCallback(() => {
    const snapshot = buildPipelineSnapshot(stateRef.current);
    persistSnapshotToLocalStorage(snapshot);
    setUnsavedChanges(false);
  }, [persistSnapshotToLocalStorage]);

  const clearPipelineState = useCallback(() => {
    Object.values(localStorageKeys).forEach((key) => {
      if (typeof key !== "string") return;
      if (key.startsWith("docetl_auth_")) return;
      localStorage.removeItem(key);
    });
    const defaults = createDefaultPipelineState(null);
    setState({
      ...defaults,
      apiKeys: stateRef.current.apiKeys,
    });
    setUnsavedChanges(false);
  }, []);

  const setStateAndUpdate = useCallback(
    <K extends keyof PipelineState>(
      key: K,
      value:
        | PipelineState[K]
        | ((prevState: PipelineState[K]) => PipelineState[K])
    ) => {
      setState((prevState) => {
        const newValue =
          typeof value === "function"
            ? (value as (prev: PipelineState[K]) => PipelineState[K])(
                prevState[key]
              )
            : value;
        if (newValue !== prevState[key]) {
          if (key === "namespace") {
            clearPipelineState();
            localStorage.setItem(
              localStorageKeys.NAMESPACE_KEY,
              JSON.stringify(newValue)
            );
            return { ...prevState, [key]: newValue, pipelineId: null };
          } else {
            if (key !== "apiKeys" && key !== "pipelineId") {
              setUnsavedChanges(true);
            }
            return { ...prevState, [key]: newValue };
          }
        }
        return prevState;
      });
    },
    [clearPipelineState]
  );

  const loadPipelineSnapshot = useCallback(
    (
      snapshot: Partial<PipelineStateSnapshot>,
      options?: { markSaved?: boolean }
    ) => {
      const mergedNamespace =
        snapshot.namespace ?? stateRef.current.namespace ?? null;
      const mergedPipelineId =
        snapshot.pipelineId ?? stateRef.current.pipelineId ?? null;
      const mergedState: PipelineState = {
        ...createDefaultPipelineState(
          mergedNamespace,
          snapshot.pipelineName ?? stateRef.current.pipelineName
        ),
        ...snapshot,
        currentFile: snapshot.currentFile ?? null,
        files: snapshot.files ?? stateRef.current.files,
        apiKeys: stateRef.current.apiKeys,
        namespace: mergedNamespace,
        pipelineId: mergedPipelineId,
      };

      setState(mergedState);
      persistSnapshotToLocalStorage(buildPipelineSnapshot(mergedState));
      if (options?.markSaved) {
        setUnsavedChanges(false);
      }
    },
    [persistSnapshotToLocalStorage]
  );

  const getSerializableState = useCallback(
    () => buildPipelineSnapshot(stateRef.current),
    []
  );

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (unsavedChanges) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [unsavedChanges]);

  useEffect(() => {
    if (
      isMounted &&
      state.apiKeys.length === 0 &&
      window.location.href.includes("docetl.org")
    ) {
      toast({
        title: "No API Keys Found",
        description:
          "If you are accessing the playground using docetl.org, please add your API keys using Edit > Edit API Keys in the menu bar. Disregard this message if you are running DocETL locally.",
        duration: 5000,
        variant: "destructive",
      });
    }
  }, [isMounted, state.apiKeys]);


  const contextValue: PipelineContextType = {
    ...state,
    setOperations: useCallback(
      (value) => setStateAndUpdate("operations", value),
      [setStateAndUpdate]
    ),
    setCurrentFile: useCallback(
      (value) => setStateAndUpdate("currentFile", value),
      [setStateAndUpdate]
    ),
    setOutput: useCallback(
      (value) => setStateAndUpdate("output", value),
      [setStateAndUpdate]
    ),
    setTerminalOutput: useCallback(
      (value) => setStateAndUpdate("terminalOutput", value),
      [setStateAndUpdate]
    ),
    setIsLoadingOutputs: useCallback(
      (value) => setStateAndUpdate("isLoadingOutputs", value),
      [setStateAndUpdate]
    ),
    setNumOpRun: useCallback(
      (value) => setStateAndUpdate("numOpRun", value),
      [setStateAndUpdate]
    ),
    setPipelineName: useCallback(
      (value) => setStateAndUpdate("pipelineName", value),
      [setStateAndUpdate]
    ),
    setSampleSize: useCallback(
      (value) => setStateAndUpdate("sampleSize", value),
      [setStateAndUpdate]
    ),
    setFiles: useCallback(
      (value) => setStateAndUpdate("files", value),
      [setStateAndUpdate]
    ),
    setCost: useCallback(
      (value) => setStateAndUpdate("cost", value),
      [setStateAndUpdate]
    ),
    setDefaultModel: useCallback(
      (value) => setStateAndUpdate("defaultModel", value),
      [setStateAndUpdate]
    ),
    setOptimizerModel: useCallback(
      (value) => setStateAndUpdate("optimizerModel", value),
      [setStateAndUpdate]
    ),
    setOptimizerProgress: useCallback(
      (value) => setStateAndUpdate("optimizerProgress", value),
      [setStateAndUpdate]
    ),
    saveProgress,
    unsavedChanges,
    clearPipelineState,
    serializeState: useCallback(() => serializeState(stateRef.current), []),
    setAutoOptimizeCheck: useCallback(
      (value) => setStateAndUpdate("autoOptimizeCheck", value),
      [setStateAndUpdate]
    ),
    setHighLevelGoal: useCallback(
      (value) => setStateAndUpdate("highLevelGoal", value),
      [setStateAndUpdate]
    ),
    setSystemPrompt: useCallback(
      (value) => setStateAndUpdate("systemPrompt", value),
      [setStateAndUpdate]
    ),
    setNamespace: useCallback(
      (value) => setStateAndUpdate("namespace", value),
      [setStateAndUpdate]
    ),
    setApiKeys: useCallback(
      (value) => setStateAndUpdate("apiKeys", value),
      [setStateAndUpdate]
    ),
    setExtraPipelineSettings: useCallback(
      (value) => setStateAndUpdate("extraPipelineSettings", value),
      [setStateAndUpdate]
    ),
    getSerializableState,
    loadPipelineSnapshot,
  };

  return (
    <PipelineContext.Provider value={contextValue}>
      {children}
    </PipelineContext.Provider>
  );
};

export const usePipelineContext = () => {
  const context = useContext(PipelineContext);
  if (context === undefined) {
    throw new Error(
      "usePipelineContext must be used within a PipelineProvider"
    );
  }
  return context;
};
