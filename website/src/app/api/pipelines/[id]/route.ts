import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/api-config";
import { buildFastApiProxyHeaders } from "@/lib/fastApiProxy";

async function forward(
  request: Request,
  pipelineId: string,
  method: "GET" | "PUT" | "PATCH" | "DELETE"
) {
  const url = new URL(request.url);
  const namespace =
    method === "GET" || method === "DELETE"
      ? url.searchParams.get("namespace")
      : undefined;

  const body = ["PUT", "PATCH"].includes(method)
    ? await request.json()
    : undefined;

  const ns = namespace || body?.namespace;
  if (!ns) {
    return NextResponse.json(
      { error: "namespace is required" },
      { status: 400 }
    );
  }

  const targetUrl =
    method === "GET" || method === "DELETE"
      ? `${getBackendUrl()}/pipelines/${pipelineId}?namespace=${encodeURIComponent(
          ns
        )}`
      : `${getBackendUrl()}/pipelines/${pipelineId}`;

  const res = await fetch(targetUrl, {
    method,
    headers: buildFastApiProxyHeaders(request, { "Content-Type": "application/json" }),
    body:
      method === "PUT" || method === "PATCH"
        ? JSON.stringify(body)
        : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: text || "Pipeline request failed" },
      { status: res.status }
    );
  }

  if (method === "DELETE") {
    return new NextResponse(null, { status: 204 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  return forward(request, params.id, "GET");
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  return forward(request, params.id, "PUT");
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  return forward(request, params.id, "PATCH");
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  return forward(request, params.id, "DELETE");
}
