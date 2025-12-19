import { NextRequest, NextResponse } from "next/server";
import { buildFastApiProxyHeaders, getFastApiUrl } from "@/lib/fastApiProxy";

const FASTAPI_URL = getFastApiUrl();
const CHUNK_SIZE = 1000000; // Number of characters to read at a time (roughly 1MB of text)

export async function GET(req: NextRequest) {
  const filePath = req.nextUrl.searchParams.get("path");
  const page = parseInt(req.nextUrl.searchParams.get("page") || "0", 10);

  if (!filePath) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `${FASTAPI_URL}/fs/read-file-page?path=${encodeURIComponent(
        filePath
      )}&page=${page}&chunk_size=${CHUNK_SIZE}`,
      { headers: buildFastApiProxyHeaders(req) }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("Error reading file:", error);
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
