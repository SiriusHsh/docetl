import React, { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export type ModelSuggestion =
  | string
  | {
      value: string;
      label?: string;
      description?: string;
      tags?: string[];
    };

interface ModelInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  suggestions?: ModelSuggestion[];
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onSelectSuggestion?: (value: string) => void;
}

type NormalizedSuggestion = {
  value: string;
  label: string;
  description?: string;
  tags: string[];
};

const normalizeSuggestion = (suggestion: ModelSuggestion): NormalizedSuggestion => {
  if (typeof suggestion === "string") {
    return {
      value: suggestion,
      label: suggestion,
      tags: [],
    };
  }
  return {
    value: suggestion.value,
    label: suggestion.label || suggestion.value,
    description: suggestion.description,
    tags: suggestion.tags || [],
  };
};

export const ModelInput: React.FC<ModelInputProps> = ({
  value,
  onChange,
  placeholder,
  suggestions = [],
  className,
  inputClassName,
  disabled,
  autoFocus,
  onBlur,
  onKeyDown,
  onFocus,
  onSelectSuggestion,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const normalizedSuggestions = useMemo(
    () =>
      suggestions.map(normalizeSuggestion).filter((item, index, array) => {
        return array.findIndex((candidate) => candidate.value === item.value) === index;
      }),
    [suggestions]
  );

  const filteredSuggestions = useMemo(() => {
    if (!value) return normalizedSuggestions;
    const lowered = value.toLowerCase();
    return normalizedSuggestions.filter(
      (item) =>
        item.label.toLowerCase().includes(lowered) ||
        item.value.toLowerCase().includes(lowered) ||
        item.tags.some((tag) => tag.toLowerCase().includes(lowered))
    );
  }, [normalizedSuggestions, value]);

  const showSuggestions = isFocused && normalizedSuggestions.length > 0;

  return (
    <div className={cn("relative", className)}>
      <Input
        value={value || ""}
        onChange={(e) => {
          onChange(e.target.value);
          setIsFocused(true);
        }}
        className={cn("w-full", inputClassName)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
        onKeyDown={onKeyDown}
      />
      {showSuggestions && (
        <div className="absolute top-full left-0 w-full mt-1 bg-popover rounded-md border shadow-md z-50 max-h-[240px] overflow-y-auto">
          {filteredSuggestions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              未找到匹配模型
            </div>
          ) : (
            filteredSuggestions.map((model) => (
              <div
                key={model.value}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(model.value);
                  onSelectSuggestion?.(model.value);
                  setIsFocused(false);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="font-medium">{model.label}</span>
                    {model.label !== model.value ? (
                      <span className="text-xs text-muted-foreground">
                        {model.value}
                      </span>
                    ) : null}
                  </div>
                  {model.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {model.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                {model.description ? (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {model.description}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
