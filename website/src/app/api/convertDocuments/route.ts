import { NextRequest, NextResponse } from "next/server";
import { buildFastApiProxyHeaders, getFastApiUrl } from "@/lib/fastApiProxy";

const FASTAPI_URL = getFastApiUrl();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files");
    const conversionMethod = formData.get("conversion_method");

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // Get Azure credentials from headers if they exist
    const azureEndpoint = request.headers.get("azure-endpoint");
    const azureKey = request.headers.get("azure-key");
    const customDoclingUrl = request.headers.get("custom-docling-url");

    // Prepare headers for the backend request (forward auth/cookies)
    const headers = buildFastApiProxyHeaders(request);
    if (azureEndpoint && azureKey) {
      headers.set("azure-endpoint", azureEndpoint);
      headers.set("azure-key", azureKey);
      headers.set("is-read", "true");
    }
    if (customDoclingUrl) {
      headers.set("custom-docling-url", customDoclingUrl);
    }

    // Create FormData since FastAPI expects multipart/form-data
    const backendFormData = new FormData();
    for (const file of files) {
      backendFormData.append("files", file);
    }

    // Determine which endpoint to use and construct the URL
    let targetUrl: string;
    if (azureEndpoint && azureKey) {
      targetUrl = `${FASTAPI_URL}/api/azure-convert-documents`;
    } else if (customDoclingUrl) {
      targetUrl = `${FASTAPI_URL}/api/convert-documents`;
    } else {
      targetUrl = `${FASTAPI_URL}/api/convert-documents${
        conversionMethod === "docetl" ? "?use_docetl_server=true" : ""
      }`;
    }

    // Forward the request to the appropriate backend
    const response = await fetch(targetUrl, {
      method: "POST",
      body: backendFormData,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Backend returned ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      documents: data.documents,
      message: "Documents converted successfully",
    });
  } catch (error) {
    console.error("Error converting documents:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
