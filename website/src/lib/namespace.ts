import * as localStorageKeys from "@/app/localStorageKeys";

const DEFAULT_NAMESPACE = "public_business";

export const readNamespace = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const stored = window.localStorage.getItem(localStorageKeys.NAMESPACE_KEY);
  if (!stored) {
    return DEFAULT_NAMESPACE;
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
};
