import { NextResponse } from "next/server";
import { buildFastApiProxyHeaders, getFastApiUrl } from "@/lib/fastApiProxy";

const FASTAPI_URL = getFastApiUrl();

export async function POST(request: Request) {
  try {
    const { namespace } = await request.json();

    if (!namespace) {
      return NextResponse.json(
        { error: "Namespace parameter is required" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${FASTAPI_URL}/fs/check-namespace?namespace=${encodeURIComponent(namespace)}`,
      {
        method: "POST",
        headers: buildFastApiProxyHeaders(request),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to check namespace");
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error checking namespace:", error);
    return NextResponse.json(
      { error: "Failed to check namespace" },
      { status: 500 }
    );
  }
}
