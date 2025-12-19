import { clearAuthSession, getAuthToken } from "@/lib/auth";

export async function backendFetch(
  input: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  const token = getAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });

  if (response.status === 401 && typeof window !== "undefined") {
    clearAuthSession();
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  return response;
}
