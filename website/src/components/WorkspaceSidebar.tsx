"use client";

import * as React from "react";
import { Folder, StickyNote } from "lucide-react";

import type { File } from "@/app/types";
import { FileExplorer } from "@/components/FileExplorer";
import BookmarksPanel from "@/components/BookmarksPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type WorkspaceSidebarProps = {
  files: File[];
  onFileClick: (file: File) => void;
  onFileUpload: (file: File) => void;
  onFileDelete: (file: File) => void;
  currentFile: File | null;
  setCurrentFile: (file: File | null) => void;
  namespace: string;
  defaultTab?: "files" | "notes";
};

export function WorkspaceSidebar({
  files,
  onFileClick,
  onFileUpload,
  onFileDelete,
  currentFile,
  setCurrentFile,
  namespace,
  defaultTab = "files",
}: WorkspaceSidebarProps) {
  return (
    <div className="h-full overflow-hidden rounded-xl border bg-card shadow-sm">
      <Tabs defaultValue={defaultTab} className="h-full flex flex-col">
        <div className="flex items-center justify-between border-b bg-card/60 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/50">
          <TabsList className="h-8">
            <TabsTrigger value="files" className="h-7 gap-2 px-3">
              <Folder className="h-4 w-4" />
              <span className="text-sm">Files</span>
            </TabsTrigger>
            <TabsTrigger value="notes" className="h-7 gap-2 px-3">
              <StickyNote className="h-4 w-4" />
              <span className="text-sm">Notes</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="files" className="m-0 min-h-0 flex-1">
          <FileExplorer
            embedded
            files={files}
            onFileClick={onFileClick}
            onFileUpload={onFileUpload}
            onFileDelete={onFileDelete}
            setCurrentFile={setCurrentFile}
            currentFile={currentFile}
            namespace={namespace}
          />
        </TabsContent>

        <TabsContent value="notes" className="m-0 min-h-0 flex-1">
          <BookmarksPanel embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}

