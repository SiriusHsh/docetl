import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/api-config";
import { buildFastApiProxyHeaders } from "@/lib/fastApiProxy";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.toString();

    const res = await fetch(
      `${getBackendUrl()}/data-center/datasets/${params.id}/preview${
        query ? `?${query}` : ""
      }`,
      { headers: buildFastApiProxyHeaders(request) }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Failed to preview dataset: ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error previewing dataset:", error);
    return NextResponse.json(
      { error: "Failed to preview dataset" },
      { status: 500 }
    );
  }
}
