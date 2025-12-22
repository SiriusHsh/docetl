import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/api-config";
import { buildFastApiProxyHeaders } from "@/lib/fastApiProxy";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const namespace = searchParams.get("namespace");
    const source = searchParams.get("source");

    if (!namespace) {
      return NextResponse.json(
        { error: "namespace is required" },
        { status: 400 }
      );
    }

    const query = new URLSearchParams({ namespace });
    if (source) {
      query.set("source", source);
    }

    const res = await fetch(
      `${getBackendUrl()}/data-center/datasets?${query.toString()}`,
      { headers: buildFastApiProxyHeaders(request) }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Failed to list datasets: ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error listing datasets:", error);
    return NextResponse.json(
      { error: "Failed to list datasets" },
      { status: 500 }
    );
  }
}
