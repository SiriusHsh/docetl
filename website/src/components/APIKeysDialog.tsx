import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertCircle, ExternalLink, Plus, X, Key } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePipelineContext } from "@/contexts/PipelineContext";
import { APIKey } from "@/app/types";

interface APIKeysDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function APIKeysDialog({ open, onOpenChange }: APIKeysDialogProps) {
  const { apiKeys, setApiKeys } = usePipelineContext();
  const [localApiKeys, setLocalApiKeys] = useState<APIKey[]>([
    { name: "OPENAI_API_KEY", value: "" },
    { name: "AZURE_API_KEY", value: "" },
    { name: "AZURE_API_BASE", value: "" },
    { name: "AZURE_API_VERSION", value: "" },
    { name: "ANTHROPIC_API_KEY", value: "" },
    { name: "GEMINI_API_KEY", value: "" },
    { name: "XAI_API_KEY", value: "" },
    { name: "TOGETHERAI_API_KEY", value: "" },
  ]);

  useEffect(() => {
    if (open) {
      const defaultKeys = [
        { name: "OPENAI_API_KEY", value: "" },
        { name: "AZURE_API_KEY", value: "" },
        { name: "AZURE_API_BASE", value: "" },
        { name: "AZURE_API_VERSION", value: "" },
        { name: "ANTHROPIC_API_KEY", value: "" },
        { name: "GEMINI_API_KEY", value: "" },
        { name: "XAI_API_KEY", value: "" },
        { name: "TOGETHERAI_API_KEY", value: "" },
      ];

      if (apiKeys.length > 0) {
        const mergedKeys = defaultKeys.map((defaultKey) => {
          const savedKey = apiKeys.find((k) => k.name === defaultKey.name);
          return savedKey || defaultKey;
        });

        const customKeys = apiKeys.filter(
          (key) => !defaultKeys.some((dk) => dk.name === key.name)
        );

        setLocalApiKeys([...mergedKeys, ...customKeys]);
      } else {
        setLocalApiKeys(defaultKeys);
      }
    }
  }, [open, apiKeys]);

  const handleInputChange = (
    index: number,
    field: "name" | "value",
    newValue: string
  ) => {
    if (index >= 8 && field === "value" && newValue.trim() === "") {
      setLocalApiKeys((prev) => prev.filter((_, i) => i !== index));
    } else {
      setLocalApiKeys((prev) =>
        prev.map((key, i) =>
          i === index ? { ...key, [field]: newValue } : key
        )
      );
    }
  };

  const addNewKey = () => {
    setLocalApiKeys((prev) => [...prev, { name: "", value: "" }]);
  };

  const removeKey = (index: number) => {
    setLocalApiKeys((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const nonEmptyKeys = localApiKeys.filter(
      (key) => key.name.trim() && key.value.trim()
    );

    setApiKeys(nonEmptyKeys);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            API Key 配置
          </DialogTitle>
          <DialogDescription>
            设置 LLM 提供方的 API Key。仅保存在内存中，刷新页面会清除。
          </DialogDescription>
          <Alert variant="destructive" className="mt-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-col gap-1">
              <span>
                出于安全考虑，系统不会保存 API Key。若想避免重复输入，
                请在本地运行 DocETL{" "}
                <a
                  href="https://ucbepic.github.io/docetl/playground/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary"
                >
                  本地版本
                </a>{" "}
                并将其配置为环境变量。
              </span>
              <span className="text-xs mt-1">
                需要使用其他模型？请查看{" "}
                <a
                  href="https://docs.litellm.ai/docs/providers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary"
                >
                  LiteLLM 提供方列表
                </a>{" "}
                了解可用模型及其环境变量名称（例如 Fireworks AI 的
                FIREWORKS_API_KEY）。
              </span>
            </AlertDescription>
          </Alert>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() =>
              window.open("https://docs.litellm.ai/docs/", "_blank")
            }
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            LiteLLM 文档
          </Button>
        </div>

        <div className="relative">
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-1">
              {localApiKeys.map((key, index) => (
                <div
                  key={index}
                  className="group relative flex gap-3 p-2 rounded-md hover:bg-muted"
                >
                  <div className="flex-1">
                    <Label
                      htmlFor={`key-name-${index}`}
                      className="text-xs text-muted-foreground"
                    >
                      变量名
                    </Label>
                    <Input
                      id={`key-name-${index}`}
                      value={key.name}
                      onChange={(e) =>
                        handleInputChange(index, "name", e.target.value)
                      }
                      placeholder="例如：OPENAI_API_KEY"
                      className="font-mono text-sm h-8 mt-1"
                    />
                  </div>
                  <div className="flex-1">
                    <Label
                      htmlFor={`key-value-${index}`}
                      className="text-xs text-muted-foreground"
                    >
                      API Key
                    </Label>
                    <Input
                      id={`key-value-${index}`}
                      value={key.value}
                      onChange={(e) =>
                        handleInputChange(index, "value", e.target.value)
                      }
                      placeholder="请输入 Key 值"
                      className="font-mono text-sm h-8 mt-1"
                    />
                  </div>
                  {index >= 8 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 self-end opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removeKey(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="h-14 flex items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addNewKey}
                  className="text-xs"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  添加自定义 Key
                </Button>
              </div>
              <div className="h-8" />
            </div>
          </ScrollArea>
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        </div>

        <DialogFooter>
          <Button onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
