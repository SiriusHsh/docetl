import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

type TestPayload = {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  prompt: string;
  protocol?: string;
};

export async function POST(req: Request) {
  try {
    const { baseUrl, apiKey, modelId, prompt, protocol } =
      (await req.json()) as TestPayload;

    if (!baseUrl || !apiKey || !modelId || !prompt) {
      return new Response(
        JSON.stringify({ error: "缺少测试所需的模型信息。" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (protocol && !["openai", "openai-compatible"].includes(protocol)) {
      return new Response(
        JSON.stringify({ error: "当前仅支持 OpenAI 兼容协议测试。" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const openai = createOpenAI({
      apiKey,
      baseURL: baseUrl,
      compatibility: "compatible",
    });

    const result = await generateText({
      model: openai(modelId),
      prompt,
    });

    return new Response(JSON.stringify({ text: result.text }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "模型测试失败",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
