import { NextRequest, NextResponse } from "next/server";
import { buildFastApiProxyHeaders, getFastApiUrl } from "@/lib/fastApiProxy";

const FASTAPI_URL = getFastApiUrl();

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");

  if (!filePath) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${FASTAPI_URL}/fs/read-file?path=${encodeURIComponent(filePath)}`,
      { headers: buildFastApiProxyHeaders(req) }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.detail || "Failed to read file" },
        { status: response.status }
      );
    }

    const content = await response.text();
    return new NextResponse(content, { status: 200 });
  } catch (error) {
    console.error("Error reading file:", error);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
