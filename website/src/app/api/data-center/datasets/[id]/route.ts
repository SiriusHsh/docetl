import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/api-config";
import { buildFastApiProxyHeaders } from "@/lib/fastApiProxy";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(
      `${getBackendUrl()}/data-center/datasets/${params.id}`,
      { headers: buildFastApiProxyHeaders(request) }
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Failed to fetch dataset: ${text}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching dataset:", error);
    return NextResponse.json(
      { error: "Failed to fetch dataset" },
      { status: 500 }
    );
  }
}
