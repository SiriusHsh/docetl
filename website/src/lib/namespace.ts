import * as localStorageKeys from "@/app/localStorageKeys";

export const NAMESPACE_CHANGE_EVENT = "docetl:namespace-change";

export const readNamespace = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.localStorage.getItem(localStorageKeys.NAMESPACE_KEY);
  if (!stored) {
    return null;
  }
  try {
    return JSON.parse(stored) as string;
  } catch {
    return stored;
  }
};

export const writeNamespace = (namespace: string | null): void => {
  if (typeof window === "undefined") {
    return;
  }
  if (namespace === null) {
    window.localStorage.removeItem(localStorageKeys.NAMESPACE_KEY);
  } else {
    window.localStorage.setItem(
      localStorageKeys.NAMESPACE_KEY,
      JSON.stringify(namespace)
    );
  }
  window.dispatchEvent(
    new CustomEvent(NAMESPACE_CHANGE_EVENT, { detail: namespace })
  );
};

export const subscribeToNamespaceChanges = (
  handler: (namespace: string | null) => void
): (() => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const handleCustom = (event: Event) => {
    const customEvent = event as CustomEvent<string | null>;
    handler(customEvent.detail ?? readNamespace());
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === localStorageKeys.NAMESPACE_KEY) {
      handler(readNamespace());
    }
  };
  window.addEventListener(NAMESPACE_CHANGE_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(NAMESPACE_CHANGE_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
};
