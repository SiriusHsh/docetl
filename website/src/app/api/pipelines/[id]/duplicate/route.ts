import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/api-config";
import { buildFastApiProxyHeaders } from "@/lib/fastApiProxy";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { namespace, name } = body;

    if (!namespace) {
      return NextResponse.json(
        { error: "namespace is required" },
        { status: 400 }
      );
    }

    const res = await fetch(
      `${getBackendUrl()}/pipelines/${params.id}/duplicate`,
      {
        method: "POST",
        headers: buildFastApiProxyHeaders(request, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ namespace, name }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Failed to duplicate pipeline: ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Error duplicating pipeline:", error);
    return NextResponse.json(
      { error: "Failed to duplicate pipeline" },
      { status: 500 }
    );
  }
}
