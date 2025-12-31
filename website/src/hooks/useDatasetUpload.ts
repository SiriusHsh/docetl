import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import type { File } from "@/app/types";
import { getBackendUrl } from "@/lib/api-config";
import { backendFetch } from "@/lib/backendFetch";

interface UseDatasetUploadOptions {
  namespace: string;
  onFileUpload: (file: File) => void;
  setCurrentFile: (file: File | null) => void;
}

export function useDatasetUpload({
  namespace,
  onFileUpload,
  setCurrentFile,
}: UseDatasetUploadOptions) {
  const { toast } = useToast();
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set());

  const uploadLocalDataset = async (file: File) => {
    const fileExtension = file.name.toLowerCase().split(".").pop();

    if (!["json", "csv"].includes(fileExtension || "")) {
      toast({
        variant: "destructive",
        title: "错误",
        description: "请上传 JSON 或 CSV 文件",
      });
      return;
    }

    toast({
      title: "正在上传数据集...",
      description: "可能需要几秒钟",
    });

    setUploadingFiles((prev) => new Set(prev).add(file.name));

    try {
      // Instead of processing the file client-side, we'll send it directly to the server
      const formData = new FormData();

      // Always save as .json regardless of input format
      const fileName = file.name.replace(/\.(json|csv)$/, ".json");

      // Send the original file blob directly to the server
      formData.append("file", file.blob, file.name);
      formData.append("namespace", namespace);

      const response = await backendFetch(`${getBackendUrl()}/fs/upload-file`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorDetails = await response.json().catch(() => ({}));
        throw new Error(errorDetails.detail || "上传失败");
      }

      const data = await response.json();

      const newFile = {
        name: fileName,
        path: data.path,
        type: "json" as const,
        parentFolder: "root",
      };

      onFileUpload(newFile);
      setCurrentFile(newFile);

      toast({
        title: "成功",
        description: "数据集上传成功",
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        variant: "destructive",
        title: "错误",
        description:
          error instanceof Error ? error.message : "上传文件失败",
      });
    } finally {
      setUploadingFiles((prev) => {
        const next = new Set(prev);
        next.delete(file.name);
        return next;
      });
    }
  };

  const uploadRemoteDataset = async (url: string) => {
    const fileName = url.split("/").pop() || "dataset.json";
    setUploadingFiles((prev) => new Set(prev).add(fileName));

    try {
      toast({
        title: "正在下载远程数据集...",
        description: "可能需要几秒钟",
      });

      const formData = new FormData();
      formData.append("url", url);
      formData.append("namespace", namespace);

      const response = await backendFetch(`${getBackendUrl()}/fs/upload-file`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        // Get the response details
        const errorDetails = await response.json();
        throw new Error(
          errorDetails.detail || "获取远程数据集失败"
        );
      }

      const data = await response.json();

      const newFile = {
        name: fileName.replace(/\.(json|csv)$/, ".json"),
        path: data.path,
        type: "json" as const,
        parentFolder: "root",
      };

      onFileUpload(newFile);
      setCurrentFile(newFile);

      toast({
        title: "成功",
        description: "远程数据集下载并处理成功",
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "错误",
        description:
          error instanceof Error
            ? error.message
            : "获取远程数据集失败",
      });
    } finally {
      setUploadingFiles((prev) => {
        const next = new Set(prev);
        next.delete(fileName);
        return next;
      });
    }
  };

  return {
    uploadingFiles,
    uploadLocalDataset,
    uploadRemoteDataset,
  };
}
