// app/api/documents/[...path]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildFastApiProxyHeaders, getFastApiUrl } from "@/lib/fastApiProxy";

const FASTAPI_URL = getFastApiUrl();

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    // Join the path segments and decode any URL encoding
    const filePath = decodeURIComponent(params.path.join("/"));

    const token = request.nextUrl.searchParams.get("token");
    const headers = buildFastApiProxyHeaders(request);
    if (token && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`);
    }

    // Forward the request to FastAPI's serve-document endpoint
    const response = await fetch(
      `${FASTAPI_URL}/fs/serve-document/${filePath}`,
      {
        method: "GET",
        headers,
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.detail },
        { status: response.status }
      );
    }

    // Stream the response from FastAPI
    const data = await response.blob();
    return new NextResponse(data, {
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/octet-stream",
        "Content-Disposition":
          response.headers.get("Content-Disposition") || "inline",
        "Cache-Control":
          response.headers.get("Cache-Control") || "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error serving file:", error);
    return NextResponse.json(
      { error: "Failed to serve file" },
      { status: 500 }
    );
  }
}
