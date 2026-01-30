export const RUNS_UPDATED_EVENT = "docetl:runs-updated";
export const RUNS_UPDATED_STORAGE_KEY = "docetl_runs_updated";

export const notifyRunsUpdated = () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(RUNS_UPDATED_EVENT));
  try {
    window.localStorage.setItem(
      RUNS_UPDATED_STORAGE_KEY,
      String(Date.now())
    );
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
};

export const subscribeRunsUpdated = (handler: () => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const onEvent = () => handler();
  const onStorage = (event: StorageEvent) => {
    if (event.key === RUNS_UPDATED_STORAGE_KEY) {
      handler();
    }
  };

  window.addEventListener(RUNS_UPDATED_EVENT, onEvent);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(RUNS_UPDATED_EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
  };
};
