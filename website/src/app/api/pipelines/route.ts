import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/api-config";
import { buildFastApiProxyHeaders } from "@/lib/fastApiProxy";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const namespace = searchParams.get("namespace");

    if (!namespace) {
      return NextResponse.json(
        { error: "namespace is required" },
        { status: 400 }
      );
    }

    const res = await fetch(
      `${getBackendUrl()}/pipelines?namespace=${encodeURIComponent(namespace)}`,
      { headers: buildFastApiProxyHeaders(request) }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Failed to list pipelines: ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error listing pipelines:", error);
    return NextResponse.json(
      { error: "Failed to list pipelines" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { namespace, name, state, description } = body;

    if (!namespace || !name) {
      return NextResponse.json(
        { error: "namespace and name are required" },
        { status: 400 }
      );
    }

    const res = await fetch(`${getBackendUrl()}/pipelines`, {
      method: "POST",
      headers: buildFastApiProxyHeaders(request, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ namespace, name, state, description }),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Failed to create pipeline: ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Error creating pipeline:", error);
    return NextResponse.json(
      { error: "Failed to create pipeline" },
      { status: 500 }
    );
  }
}
