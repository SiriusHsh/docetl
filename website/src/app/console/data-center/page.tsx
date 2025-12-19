"use client";

import { Database, FileText, UploadCloud } from "lucide-react";

export default function DataCenterPage() {
  return (
    <div className="px-6 py-6">
      <div className="flex items-center gap-3">
        <Database className="h-6 w-6 text-slate-200" />
        <h1 className="text-2xl font-semibold text-white">Data Center</h1>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Consolidate user uploads and pipeline outputs with Excel parsing support.
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <UploadCloud className="h-4 w-4" />
            <span>User Uploads</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Upload Excel/CSV/JSON files to namespace datasets.
          </p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-white/5 p-5">
          <div className="flex items-center gap-2 text-sm text-slate-200">
            <FileText className="h-4 w-4" />
            <span>Pipeline Outputs</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Track pipeline-generated files with preview support.
          </p>
        </div>
      </div>
    </div>
  );
}
