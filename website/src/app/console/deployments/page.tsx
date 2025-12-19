"use client";

import { CalendarClock, Rocket } from "lucide-react";

export default function DeploymentsPage() {
  return (
    <div className="px-6 py-6">
      <div className="flex items-center gap-3">
        <Rocket className="h-6 w-6 text-slate-200" />
        <h1 className="text-2xl font-semibold text-white">Deployments</h1>
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Configure schedules and automated pipeline execution.
      </p>

      <div className="mt-6 rounded-2xl border border-white/5 bg-white/5 p-5">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <CalendarClock className="h-4 w-4" />
          <span>No deployments yet</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Create a deployment to configure triggers, retries, and concurrency.
        </p>
      </div>
    </div>
  );
}
