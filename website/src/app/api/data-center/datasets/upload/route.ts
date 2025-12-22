import { NextRequest, NextResponse } from "next/server";
import { buildFastApiProxyHeaders, getFastApiUrl } from "@/lib/fastApiProxy";

const FASTAPI_URL = getFastApiUrl();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const namespace = formData.get("namespace") as string | null;

    if (!file || !namespace) {
      return NextResponse.json(
        { error: "file and namespace are required" },
        { status: 400 }
      );
    }

    const apiFormData = new FormData();
    apiFormData.append("file", file);
    apiFormData.append("namespace", namespace);

    const name = formData.get("name");
    const sheetName = formData.get("sheet_name");
    const sheetIndex = formData.get("sheet_index");
    const headerRow = formData.get("header_row");
    const maxRows = formData.get("max_rows");

    if (name) apiFormData.append("name", String(name));
    if (sheetName) apiFormData.append("sheet_name", String(sheetName));
    if (sheetIndex) apiFormData.append("sheet_index", String(sheetIndex));
    if (headerRow) apiFormData.append("header_row", String(headerRow));
    if (maxRows) apiFormData.append("max_rows", String(maxRows));

    const response = await fetch(
      `${FASTAPI_URL}/data-center/datasets/upload`,
      {
        method: "POST",
        body: apiFormData,
        headers: buildFastApiProxyHeaders(request),
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json(
        { error: detail || "Failed to upload dataset" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Error uploading dataset:", error);
    return NextResponse.json(
      { error: "Failed to upload dataset" },
      { status: 500 }
    );
  }
}
