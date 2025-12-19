import { getBackendUrl } from "@/lib/api-config";

export function getFastApiUrl(): string {
  return getBackendUrl();
}

export function buildFastApiProxyHeaders(
  request: Request,
  initHeaders?: HeadersInit
): Headers {
  const headers = new Headers(initHeaders ?? {});

  const authorization = request.headers.get("authorization");
  if (authorization && !headers.has("authorization")) {
    headers.set("authorization", authorization);
  }

  const cookie = request.headers.get("cookie");
  if (cookie && !headers.has("cookie")) {
    headers.set("cookie", cookie);
  }

  const requestId = request.headers.get("x-request-id");
  if (requestId && !headers.has("x-request-id")) {
    headers.set("x-request-id", requestId);
  }

  return headers;
}

