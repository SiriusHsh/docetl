import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PopoverContent } from "@/components/ui/popover";

interface AIEditPopoverProps {
  onSubmit: (instruction: string) => void;
}

export const AIEditPopover: React.FC<AIEditPopoverProps> = React.memo(
  ({ onSubmit }) => {
    const [instruction, setInstruction] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!instruction.trim()) return;

      setIsLoading(true);
      try {
        await onSubmit(instruction);
        setInstruction("");
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <PopoverContent>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              描述你希望如何修改该操作。
            </p>
            <div className="grid gap-2">
              <Textarea
                placeholder="例如：让提示词更简洁"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={isLoading}
              />
              <Button type="submit" disabled={!instruction.trim() || isLoading}>
                {isLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                ) : (
                  "应用"
                )}
              </Button>
            </div>
          </div>
        </form>
      </PopoverContent>
    );
  }
);

AIEditPopover.displayName = "AIEditPopover";
