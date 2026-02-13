"use client";

import { Fragment, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

type ToneKey = "quantity" | "efficiency" | "result";

const THEME_STYLE = {
  "--tone-quantity": "210 86% 45%",
  "--tone-efficiency": "152 52% 36%",
  "--tone-result": "28 92% 55%",
  "--tone-surface": "210 30% 98%",
} as CSSProperties;

const quantityTrend = [
  { day: "01-08", raw: 280, cleaned: 210, output: 180, hq: 120 },
  { day: "01-10", raw: 300, cleaned: 226, output: 195, hq: 131 },
  { day: "01-12", raw: 320, cleaned: 240, output: 205, hq: 140 },
  { day: "01-14", raw: 310, cleaned: 238, output: 198, hq: 136 },
  { day: "01-16", raw: 330, cleaned: 252, output: 210, hq: 150 },
  { day: "01-18", raw: 350, cleaned: 268, output: 228, hq: 166 },
  { day: "01-20", raw: 360, cleaned: 275, output: 234, hq: 172 },
];

const monthlySummaryTrend = [
  { month: "2026-01", raw: 0, hq: 0 },
  { month: "2026-02", raw: 210, hq: 90 },
  { month: "2026-03", raw: 250, hq: 110 },
  { month: "2026-04", raw: 280, hq: 125 },
  { month: "2026-05", raw: 320, hq: 150 },
  { month: "2026-06", raw: 350, hq: 170 },
];

const pipelineLevels = [
  { name: "数据蒸馏", L1: 52, L2: 78, L3: 90, L4: 60, L5: 30 },
  { name: "数据合成", L1: 40, L2: 64, L3: 82, L4: 68, L5: 42 },
  { name: "数据泛化", L1: 46, L2: 70, L3: 88, L4: 62, L5: 35 },
  { name: "数据转化", L1: 34, L2: 55, L3: 76, L4: 58, L5: 28 },
  { name: "人工创建", L1: 28, L2: 48, L3: 66, L4: 52, L5: 22 },
];

const qualityDistribution = [
  { bucket: "0.6-0.7", value: 18 },
  { bucket: "0.7-0.75", value: 26 },
  { bucket: "0.75-0.8", value: 38 },
  { bucket: "0.8-0.85", value: 52 },
  { bucket: "0.85-0.9", value: 44 },
  { bucket: "0.9+", value: 32 },
];

const efficiencyTrend = [
  { day: "01-08", freshness: 3.4, latency: 12.1 },
  { day: "01-10", freshness: 3.1, latency: 11.4 },
  { day: "01-12", freshness: 2.9, latency: 10.8 },
  { day: "01-14", freshness: 2.7, latency: 10.2 },
  { day: "01-16", freshness: 2.6, latency: 9.7 },
  { day: "01-18", freshness: 2.5, latency: 9.5 },
  { day: "01-20", freshness: 2.4, latency: 9.2 },
];

const throughputTrend = [
  { day: "01-08", value: 46 },
  { day: "01-10", value: 48 },
  { day: "01-12", value: 55 },
  { day: "01-14", value: 52 },
  { day: "01-16", value: 58 },
  { day: "01-18", value: 63 },
  { day: "01-20", value: 66 },
];

const interceptReasons = [
  { name: "字段缺失", value: 182 },
  { name: "噪声过高", value: 144 },
  { name: "重复样本", value: 118 },
  { name: "冲突标签", value: 74 },
  { name: "异常长度", value: 62 },
];

const qualityTrend = [
  { day: "01-08", hq: 52, mid: 33, low: 15 },
  { day: "01-10", hq: 55, mid: 31, low: 14 },
  { day: "01-12", hq: 58, mid: 29, low: 13 },
  { day: "01-14", hq: 60, mid: 28, low: 12 },
  { day: "01-16", hq: 62, mid: 27, low: 11 },
  { day: "01-18", hq: 63, mid: 26, low: 11 },
  { day: "01-20", hq: 64, mid: 26, low: 10 },
];

const QUICK_METRICS = [
  { label: "数据货架总量", value: "3.42M", note: "累计入架样本" },
  { label: "生成高质量数据总量", value: "1.18M", note: "质量阈值以上" },
  { label: "数据新鲜度", value: "2.4 天", note: "端到端链路" },
  { label: "流水线条数", value: "10", note: "已登记流水线" },
  { label: "流水线执行次数", value: "124", note: "近7天" },
];

const benchmarkDelta = [
  { name: "意图识别", value: 3.2 },
  { name: "长文摘要", value: 2.4 },
  { name: "结构抽取", value: 4.1 },
  { name: "多轮对话", value: 3.6 },
];

const toneClass: Record<ToneKey, string> = {
  quantity: "text-[hsl(var(--tone-quantity))]",
  efficiency: "text-[hsl(var(--tone-efficiency))]",
  result: "text-[hsl(var(--tone-result))]",
};

const PANEL_OPTIONS: Array<{ key: ToneKey; label: string; hint: string }> = [
  { key: "quantity", label: "数量总览", hint: "规模结构" },
  { key: "efficiency", label: "效率链路", hint: "耗时与吞吐" },
  { key: "result", label: "效果验证", hint: "质量沉淀" },
];

type BarLabelProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number | string;
};

function StackValueLabel({ x, y, width, height, value }: BarLabelProps) {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    width < 34 ||
    value == null
  ) {
    return null;
  }
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      dy={4}
      textAnchor="middle"
      fill="#ffffff"
      fontSize={11}
      fontWeight={600}
      style={{ pointerEvents: "none" }}
    >
      {value}
    </text>
  );
}

function StackTotalLabel({ x, y, width, height, value }: BarLabelProps) {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    value == null
  ) {
    return null;
  }
  return (
    <text
      x={x + width + 10}
      y={y + height / 2}
      dy={4}
      fill="#64748b"
      fontSize={11}
      fontWeight={600}
      style={{ pointerEvents: "none" }}
    >
      {value}
    </text>
  );
}

const efficiencyStages = [
  { label: "数据获取", detail: "采集与校验", hours: 6.5 },
  { label: "数据生成", detail: "清洗与生成", hours: 10.2 },
  { label: "模型训练", detail: "微调与评测", hours: 22.8 },
  { label: "推理上线", detail: "推理入池", hours: 4.3 },
];

function SectionHeader({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: ToneKey;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div
          className={cn(
            "text-xs font-semibold uppercase tracking-[0.24em]",
            toneClass[tone]
          )}
        >
          {title}
        </div>
        <div className="mt-1.5 text-xl font-semibold text-slate-900">
          {description}
        </div>
      </div>
      <div className="hidden items-center gap-2 rounded-full border border-white/40 bg-white/70 px-3 py-1 text-xs text-slate-500 shadow-sm sm:flex">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        实时同步至训练池
      </div>
    </div>
  );
}

function SummaryLineCard({
  title,
  value,
  dataKey,
  stroke,
  gradientId,
}: {
  title: string;
  value: string;
  dataKey: "raw" | "hq";
  stroke: string;
  gradientId: string;
}) {
  return (
    <div className="rounded-3xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        {title}
      </div>
      <div className="mt-3 text-3xl font-semibold text-slate-900">{value}</div>
      <div className="mt-5 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={monthlySummaryTrend} margin={{ left: -8, right: 12 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={stroke} stopOpacity={0.35} />
                <stop offset="95%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <YAxis
              domain={[0, "auto"]}
              tick={{ fontSize: 10 }}
              stroke="#94a3b8"
              width={32}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              fill={`url(#${gradientId})`}
              strokeWidth={2}
              dot={{ r: 3.5, stroke, strokeWidth: 2, fill: "#ffffff" }}
              activeDot={{ r: 4.5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MiniMetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
}

function EfficiencyFlow() {
  const totalHours = efficiencyStages.reduce((sum, item) => sum + item.hours, 0);
  const bottleneck = efficiencyStages.reduce((prev, item) =>
    item.hours > prev.hours ? item : prev
  );
  const totalDays = totalHours / 24;

  return (
    <div className="rounded-3xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            数据新鲜度链路
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            端到端耗时 {totalDays.toFixed(1)} 天
          </div>
        </div>
        {/* average freshness badge removed */}
      </div>

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center">
        {efficiencyStages.flatMap((stage, index) => {
          const percent = Math.round((stage.hours / totalHours) * 100);
          const isBottleneck = stage.label === bottleneck.label;
          const items = [
            <div
              key={`${stage.label}-card`}
              className={cn(
                "w-full min-h-[200px] rounded-2xl border bg-white/90 p-5 shadow-sm lg:flex-1",
                isBottleneck
                  ? "border-amber-200 bg-amber-50/40"
                  : "border-slate-100"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">
                  {stage.label}
                </div>
                <div className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  {percent}%
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-500">{stage.detail}</div>
              <div className="mt-4 text-3xl font-semibold text-slate-900">
                {stage.hours}h
              </div>
              <div className="mt-4 h-2 rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-2 rounded-full",
                    isBottleneck ? "bg-amber-400" : "bg-emerald-400"
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>,
          ];

          if (index < efficiencyStages.length - 1) {
            items.push(
              <div
                key={`${stage.label}-connector`}
                className="hidden h-12 w-16 items-center lg:flex"
              >
                <div className="h-1 w-full rounded-full bg-slate-200">
                  <div className="flow-line h-1 w-full rounded-full" />
                </div>
              </div>
            );
          }

          return items;
        })}
      </div>
    </div>
  );
}

export default function DataMetricsPage() {
  const numberFormat = useMemo(() => new Intl.NumberFormat("zh-CN"), []);
  const [activePanel, setActivePanel] = useState<ToneKey>("quantity");
  const pipelineOutputData = useMemo(() => {
    return pipelineLevels
      .map((row) => {
        const L12 = row.L1 + row.L2;
        const L34 = row.L3 + row.L4;
        const L5 = row.L5;
        return {
          name: row.name,
          L12,
          L34,
          L5,
          total: L12 + L34 + L5,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, []);
  const totalStageHours = useMemo(
    () => efficiencyStages.reduce((sum, stage) => sum + stage.hours, 0),
    []
  );
  const bottleneckStage = useMemo(
    () =>
      efficiencyStages.reduce((prev, stage) =>
        stage.hours > prev.hours ? stage : prev
      ),
    []
  );
  const totalInterceptCount = useMemo(
    () => interceptReasons.reduce((sum, item) => sum + item.value, 0),
    []
  );
  const totalGeneratedSamples = useMemo(
    () => pipelineOutputData.reduce((sum, item) => sum + item.total, 0),
    [pipelineOutputData]
  );
  const l5Share = useMemo(() => {
    if (!totalGeneratedSamples) return 0;
    const l5Total = pipelineOutputData.reduce((sum, item) => sum + item.L5, 0);
    return Math.round((l5Total / totalGeneratedSamples) * 100);
  }, [pipelineOutputData, totalGeneratedSamples]);

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-slate-50"
      style={THEME_STYLE}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute right-[-120px] top-24 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute bottom-[-140px] left-1/3 h-96 w-96 rounded-full bg-sky-200/40 blur-3xl" />
      </div>

      <div
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-5"
        style={{ fontFamily: "var(--font-geist-sans)" }}
      >
        <header>
          <h1 className="text-[24px] font-semibold leading-tight text-slate-900">
            端到端数据指标可视化
          </h1>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {QUICK_METRICS.map((metric) => (
            <MiniMetricCard key={metric.label} {...metric} />
          ))}
        </section>

        <section className="rounded-2xl border border-white/80 bg-white/75 p-2 shadow-sm backdrop-blur">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PANEL_OPTIONS.map((option) => {
              const active = activePanel === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setActivePanel(option.key)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left transition-all",
                    active
                      ? "border-slate-300 bg-white shadow-sm"
                      : "border-transparent bg-slate-100/70 hover:bg-slate-100"
                  )}
                >
                  <div
                    className={cn(
                      "text-[11px] font-semibold uppercase tracking-[0.2em]",
                      toneClass[option.key],
                      !active && "opacity-70"
                    )}
                  >
                    {option.hint}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {option.label}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {activePanel === "quantity" ? (
          <section className="animate-slide-in grid gap-4 xl:grid-cols-[1.12fr_1fr]">
            <div className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-sm backdrop-blur">
              <SectionHeader
                title="数量"
                description="规模结构与质量分布"
                tone="quantity"
              />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <SummaryLineCard
                  title="输入原始样本总数"
                  value="3.42M"
                  dataKey="raw"
                  stroke="#38bdf8"
                  gradientId="rawSummaryFillCompact"
                />
                <SummaryLineCard
                  title="产出高质量数据总数"
                  value="1.18M"
                  dataKey="hq"
                  stroke="#f59e0b"
                  gradientId="hqSummaryFillCompact"
                />
              </div>
            </div>

            <div className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-sm backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-base font-semibold text-slate-900">数据生成分布</div>
                  <div className="mt-1 text-xs text-slate-500">
                    分层结构与各流水线产出总量
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
                    L5 占比 {l5Share}%
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-sky-700">
                  <span className="h-2 w-2 rounded-full bg-sky-400" />
                  L1/L2
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  L3/L4
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-100 bg-amber-50 px-2 py-1 text-amber-700">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  L5
                </span>
              </div>

              <div className="mt-3 h-[320px] rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50/70 via-white to-sky-50/50 p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={pipelineOutputData}
                    layout="vertical"
                    margin={{ left: 10, right: 28, top: 8, bottom: 8 }}
                    barCategoryGap="28%"
                  >
                    <defs>
                      <linearGradient id="l12BarGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.85} />
                      </linearGradient>
                      <linearGradient id="l34BarGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.82} />
                      </linearGradient>
                      <linearGradient id="l5BarGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.92} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.9} />
                      </linearGradient>
                    </defs>
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 12, fill: "#64748b", fontWeight: 500 }}
                      width={70}
                      axisLine={false}
                      tickLine={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(148,163,184,0.08)" }}
                      contentStyle={{
                        borderRadius: 12,
                        borderColor: "#e2e8f0",
                        backgroundColor: "rgba(255,255,255,0.96)",
                        boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                      }}
                      labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                    />
                    <Bar
                      dataKey="L12"
                      name="L1/L2"
                      stackId="a"
                      fill="url(#l12BarGradient)"
                      radius={[8, 0, 0, 8]}
                      barSize={24}
                    >
                      <LabelList dataKey="L12" content={StackValueLabel} />
                    </Bar>
                    <Bar
                      dataKey="L34"
                      name="L3/L4"
                      stackId="a"
                      fill="url(#l34BarGradient)"
                      barSize={24}
                    >
                      <LabelList dataKey="L34" content={StackValueLabel} />
                    </Bar>
                    <Bar
                      dataKey="L5"
                      name="L5"
                      stackId="a"
                      fill="url(#l5BarGradient)"
                      radius={[0, 8, 8, 0]}
                      barSize={24}
                    >
                      <LabelList dataKey="L5" content={StackValueLabel} />
                      <LabelList dataKey="total" content={StackTotalLabel} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        ) : null}

        {activePanel === "efficiency" ? (
          <section className="animate-slide-in grid gap-4 xl:grid-cols-[1.12fr_1fr]">
            <div className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-sm backdrop-blur">
              <SectionHeader
                title="效率"
                description="新鲜度与执行效率"
                tone="efficiency"
              />
              <div className="mt-4 h-[286px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={efficiencyTrend} margin={{ left: -10, right: 14 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="freshness"
                      name="新鲜度(天)"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="latency"
                      name="延迟(h)"
                      stroke="#3b82f6"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold text-slate-900">链路耗时拆解</div>
                <div className="text-xs text-slate-500">
                  总计 {(totalStageHours / 24).toFixed(1)} 天
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {efficiencyStages.map((stage) => {
                  const percent = Math.round((stage.hours / totalStageHours) * 100);
                  const isBottleneck = stage.label === bottleneckStage.label;
                  return (
                    <Fragment key={stage.label}>
                      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-slate-800">{stage.label}</div>
                          <div className="text-xs font-semibold text-slate-500">{stage.hours}h</div>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                          <div
                            className={cn(
                              "h-1.5 rounded-full",
                              isBottleneck ? "bg-amber-400" : "bg-emerald-400"
                            )}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
              <div className="mt-4 h-[98px] rounded-2xl border border-slate-200/70 bg-white/90 p-2.5">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={throughputTrend} margin={{ left: -10, right: 12 }}>
                    <defs>
                      <linearGradient id="throughputFillCompact" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0.06} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" width={24} />
                    <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} />
                    <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#throughputFillCompact)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        ) : null}

        {activePanel === "result" ? (
          <section className="animate-slide-in grid gap-4 xl:grid-cols-[1.12fr_1fr]">
            <div className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-sm backdrop-blur">
              <SectionHeader
                title="结果"
                description="高质量沉淀与效果验证"
                tone="result"
              />
              <div className="mt-4 h-[286px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={qualityTrend} margin={{ left: -12, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} />
                    <Area type="monotone" dataKey="hq" stackId="1" stroke="#34d399" fill="#34d399" />
                    <Area type="monotone" dataKey="mid" stackId="1" stroke="#fbbf24" fill="#fbbf24" />
                    <Area type="monotone" dataKey="low" stackId="1" stroke="#fca5a5" fill="#fca5a5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-sm backdrop-blur">
                <div className="text-base font-semibold text-slate-900">规则拦截原因</div>
                <div className="mt-3 h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={interceptReasons} margin={{ left: -12, right: 16 }} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" width={72} />
                      <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} />
                      <Bar dataKey="value" fill="#f97316" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  近7天累计拦截 {numberFormat.format(totalInterceptCount)} 条
                </div>
              </div>

              <div className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-sm backdrop-blur">
                <div className="text-base font-semibold text-slate-900">Benchmark 提升</div>
                <div className="mt-3 h-[150px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={benchmarkDelta} margin={{ left: -12, right: 16 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} />
                      <Bar dataKey="value" fill="#22c55e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>训练池样本：{numberFormat.format(920000)}</span>
                  <span>质量阈值：0.82</span>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
