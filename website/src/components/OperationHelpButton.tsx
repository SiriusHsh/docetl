import React from "react";
import { HelpCircle, Copy, Check } from "lucide-react";
import { Button } from "./ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card";

interface OperationHelpButtonProps {
  type: string;
}

export const OperationHelpButton: React.FC<OperationHelpButtonProps> = ({
  type,
}) => {
  const [copiedPrompt, setCopiedPrompt] = React.useState<string | null>(null);

  const handleCopy = async (text: string, promptId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedPrompt(promptId);
    setTimeout(() => setCopiedPrompt(null), 2000);
  };

  const PromptBlock = ({ text, id }: { text: string; id: string }) => (
    <div className="relative group">
      <pre className="bg-slate-100 p-2 rounded text-sm whitespace-pre-wrap font-mono">
        {text}
      </pre>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => handleCopy(text, id)}
      >
        {copiedPrompt === id ? (
          <Check className="h-4 w-4" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );

  const getExamplePrompt = () => {
    switch (type) {
      case "map":
        return (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                提示词会针对每条文档执行一次。每条文档可通过{" "}
                <span className="font-mono">input</span> 访问，可用点号引用字段：
              </p>
              <div className="space-y-2">
                <p>引用整条文档：</p>
                <PromptBlock
                  text={"分析以下内容：{{ input }}"}
                  id="map-example"
                />
                <p>
                  或引用指定字段（例如文档有 &ldquo;text&rdquo; 字段）：
                </p>
                <PromptBlock
                  text={"分析以下文本：{{ input.text }}"}
                  id="map-specific"
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-sm">
                输出 Schema 是什么？
              </p>
              <div className="border rounded p-3">
                <p className="text-sm">
                  Schema 定义 LLM 要为每条文档新增的字段。例如：
                </p>
                <div className="mt-2 pl-4 text-sm text-muted-foreground">
                  字段：<span className="font-mono">summary</span>
                  <br />
                  类型：<span className="font-mono">string</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  每条文档会保留原有字段，并新增这个字段。
                </p>
              </div>
            </div>
          </div>
        );

      case "filter":
        return (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                提示词会针对每条文档执行一次。每条文档可通过{" "}
                <span className="font-mono">input</span> 访问，可用点号引用字段：
              </p>
              <div className="space-y-2">
                <p>引用整条文档：</p>
                <PromptBlock
                  text={"是否保留这条记录？{{ input }}"}
                  id="filter-example"
                />
                <p>
                  或引用指定字段（例如文档有 &ldquo;content&rdquo; 字段）：
                </p>
                <PromptBlock
                  text={"这段内容是否相关？{{ input.content }}"}
                  id="filter-specific"
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-sm">
                输出 Schema 是什么？
              </p>
              <div className="border rounded p-3">
                <p className="text-sm">
                  对于过滤操作，Schema 必须是一个布尔字段，用于决定是否保留该文档：
                </p>
                <div className="mt-2 pl-4 text-sm text-muted-foreground">
                  字段：<span className="font-mono">keep_document</span>
                  <br />
                  类型：<span className="font-mono">boolean</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  该字段为 true 的文档会被保留，其余会被过滤掉。
                </p>
              </div>
            </div>
          </div>
        );

      case "reduce":
        return (
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">
                Reduce 操作会按 &ldquo;reduce key&rdquo;（类似 SQL 的 GROUP BY）
                对文档分组，然后每组运行一次提示词。reduce key 可以是一个或多个字段，
                这些字段取值相同的文档会被一起处理。
              </p>
              <p className="mb-2 text-sm text-muted-foreground">
                使用 &ldquo;_all&rdquo; 作为 reduce key 可将所有文档视为同一组处理。
              </p>
              <p className="mb-2 text-sm text-muted-foreground">
                每个分组内的文档会在{" "}
                <span className="font-mono">inputs</span> 列表中提供，
                可用点号引用字段：
              </p>
              <div className="space-y-2">
                <p>引用整条文档：</p>
                <PromptBlock
                  text={
                    "分析以下文档：\n\n{% for input in inputs %}\n文档：{{ input }}\n{% endfor %}"
                  }
                  id="reduce-example"
                />
                <p>
                  或引用指定字段（例如文档有 &ldquo;title&rdquo; 字段）：
                </p>
                <PromptBlock
                  text={
                    "分析以下文档：\n\n{% for input in inputs %}\n标题：{{ input.title }}\n{% endfor %}"
                  }
                  id="reduce-specific"
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-sm">
                输出 Schema 是什么？
              </p>
              <div className="border rounded p-3">
                <p className="text-sm">
                  Schema 定义每个分组输出的新行字段。每个分组（由 reduce key 确定）
                  会产出一行，包含这些输出字段：
                </p>
                <div className="mt-2 pl-4 text-sm text-muted-foreground">
                  字段：<span className="font-mono">combined_analysis</span>
                  <br />
                  类型：<span className="font-mono">string</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  例如以 &ldquo;category&rdquo; 分组时，每个不同的类别会输出一行，
                  汇总该类别下的所有文档。
                </p>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <HoverCard openDelay={0} closeDelay={0}>
      <HoverCardTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 cursor-help">
          <HelpCircle className="h-4 w-4 text-gray-600" />
        </Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-[750px]">
        <div className="space-y-4">
          <h4 className="font-medium">操作指南</h4>
          {getExamplePrompt()}
          <div className="text-sm text-muted-foreground">
            <p>
              可在数据集视图（右上角）查看可用的输入字段。
            </p>
            <p className="mt-2">
              更多细节请查看{" "}
              <a
                href={`https://ucbepic.github.io/docetl/operators/${type}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {type} 操作文档
              </a>
              .
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};
