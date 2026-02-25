import { NextResponse } from "next/server";
import { generatePipelineConfig } from "@/app/api/utils";
import os from "os";
import { buildFastApiProxyHeaders, getFastApiUrl } from "@/lib/fastApiProxy";

const FASTAPI_URL = getFastApiUrl();

export async function POST(request: Request) {
  try {
    const {
      default_model,
      data,
      operations,
      operation_id,
      name,
      sample_size,
      namespace,
      check_output = true,
      include_input_count = false,
    } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: "Pipeline name is required" },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Data is required. Please select a file in the sidebar." },
        { status: 400 }
      );
    }

    const homeDir = process.env.DOCETL_HOME_DIR || os.homedir();
    const { inputPath, outputPath } = generatePipelineConfig(
      namespace,
      default_model,
      data,
      operations,
      operation_id,
      name,
      homeDir,
      sample_size,
      false,
      false,
      { datasetDescription: null, persona: null },
      [],
      "",
      false
    );

    // Check if files exist using FastAPI endpoints
    const checkInputResponse = await fetch(
      `${FASTAPI_URL}/fs/check-file?path=${encodeURIComponent(inputPath)}`,
      {
        method: "GET",
        headers: buildFastApiProxyHeaders(request),
      }
    );

    if (!checkInputResponse.ok) {
      console.error(`Failed to check input path: ${inputPath}`);
      return NextResponse.json(
        { error: "Failed to check input path" },
        { status: 500 }
      );
    }

    const inputResult = await checkInputResponse.json();
    if (!inputResult.exists) {
      console.error(`Input path does not exist: ${inputPath}`);
      return NextResponse.json(
        { error: "Input path does not exist" },
        { status: 400 }
      );
    }

    let inputCount: number | null = null;
    if (include_input_count) {
      try {
        const readInputResponse = await fetch(
          `${FASTAPI_URL}/fs/read-file?path=${encodeURIComponent(inputPath)}`,
          {
            method: "GET",
            headers: buildFastApiProxyHeaders(request),
          }
        );

        if (readInputResponse.ok) {
          const inputContent = await readInputResponse.text();
          const parsedInput = JSON.parse(inputContent);
          if (Array.isArray(parsedInput)) {
            inputCount = parsedInput.length;
          } else if (parsedInput && typeof parsedInput === "object") {
            inputCount = 1;
          } else {
            inputCount = 0;
          }
        }
      } catch (error) {
        console.warn("Failed to read or parse input file for input count:", error);
        inputCount = null;
      }
    }

    if (!check_output) {
      return NextResponse.json({ inputPath, outputPath, inputCount });
    }

    const checkOutputResponse = await fetch(
      `${FASTAPI_URL}/fs/check-file?path=${encodeURIComponent(outputPath)}`,
      {
        method: "GET",
        headers: buildFastApiProxyHeaders(request),
      }
    );

    if (!checkOutputResponse.ok) {
      console.error(`Failed to check output path: ${outputPath}`);
      return NextResponse.json(
        { error: "Failed to check output path" },
        { status: 500 }
      );
    }

    const outputResult = await checkOutputResponse.json();
    if (!outputResult.exists) {
      console.error(`Output path does not exist: ${outputPath}`);
      return NextResponse.json(
        { error: "Output path does not exist" },
        { status: 400 }
      );
    }

    return NextResponse.json({ inputPath, outputPath, inputCount });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to get input and output paths" },
      { status: 500 }
    );
  }
}
